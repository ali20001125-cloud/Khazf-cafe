-- =====================================================================
-- إتمام البيع: عملية واحدة ذرّية (طلب + بنود + خصم مخزون)
-- الأسعار تُقرأ من قاعدة البيانات — لا نثق بأي سعر قادم من المتصفح.
--
-- ترتيب متعمّد: كل التحقّق أولاً، ثم رقم الفاتورة.
-- سبب رقابي: أي فجوة بأرقام الفواتير تعني شيئاً — فلا نحرق رقماً
-- على محاولة فاشلة (الرقم يُسحب من متتالية لا تتراجع مع الإلغاء).
-- =====================================================================

create or replace function checkout(
  p_items          jsonb,            -- [{drink_id, qty, service, extra_shots, note}]
  p_payment_method payment_method,
  p_cash_received  integer default null,
  p_service        service_type default 'takeaway',
  p_shift_id       uuid default null,
  p_employee_id    uuid default null
)
returns table (order_id uuid, order_number bigint, total integer, change_due integer)
language plpgsql
set search_path = public
as $$
declare
  v_order_id     uuid;
  v_number       bigint;
  v_total        integer := 0;
  v_change       integer;
  v_shot_price   integer;
  v_shot_grams   numeric;
  v_lines        jsonb := '[]'::jsonb;
  it             jsonb;
  ln             jsonb;
  v_drink        drinks%rowtype;
  v_qty          integer;
  v_service      service_type;
  v_shots        integer;
  v_unit         integer;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'السلة فارغة';
  end if;

  select coalesce((value->>0)::integer, 0) into v_shot_price
    from settings where key = 'extra_shot_price';
  v_shot_price := coalesce(v_shot_price, 0);

  select coalesce((value->>0)::numeric, 9) into v_shot_grams
    from settings where key = 'shot_grams';
  v_shot_grams := coalesce(v_shot_grams, 9);

  -- ١) تسعير وتحقّق: بلا أي كتابة بعد
  for it in select * from jsonb_array_elements(p_items) loop
    select * into v_drink from drinks where id = (it->>'drink_id')::uuid and active;
    if not found then
      raise exception 'مشروب غير موجود أو غير مفعّل';
    end if;

    v_qty     := greatest(1, coalesce((it->>'qty')::integer, 1));
    v_shots   := greatest(0, coalesce((it->>'extra_shots')::integer, 0));
    v_service := coalesce((it->>'service')::service_type, p_service);
    v_unit    := v_drink.price + (v_shots * v_shot_price);
    v_total   := v_total + (v_unit * v_qty);

    v_lines := v_lines || jsonb_build_object(
      'drink_id',   v_drink.id,
      'drink_name', v_drink.name,
      'crop_id',    v_drink.crop_material_id,
      'qty',        v_qty,
      'unit_price', v_unit,
      'service',    v_service,
      'shots',      v_shots,
      'note',       nullif(it->>'note', '')
    );
  end loop;

  -- ٢) تحقّق الدفع قبل حجز أي رقم فاتورة
  if p_payment_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then
      raise exception 'المبلغ المستلم أقل من المطلوب';
    end if;
    v_change := p_cash_received - v_total;
  end if;

  -- ٣) الكتابة: الطلب ثم البنود ثم خصم المخزون
  insert into orders
    (shift_id, employee_id, status, payment_method, service,
     total, cash_received, change_due, paid_at)
  values
    (p_shift_id, p_employee_id, 'paid', p_payment_method, p_service,
     v_total,
     case when p_payment_method = 'cash' then p_cash_received end,
     v_change, now())
  returning id, number into v_order_id, v_number;

  for ln in select * from jsonb_array_elements(v_lines) loop
    insert into order_items
      (order_id, drink_id, drink_name, qty, unit_price, service, extra_shots, note)
    values
      (v_order_id,
       (ln->>'drink_id')::uuid,
       ln->>'drink_name',
       (ln->>'qty')::integer,
       (ln->>'unit_price')::integer,
       (ln->>'service')::service_type,
       (ln->>'shots')::integer,
       ln->>'note');

    -- خصم المخزون حسب الوصفة (الكوب والغطاء للسفري فقط)
    update materials m
       set stock = m.stock - (dm.qty * (ln->>'qty')::integer)
      from drink_materials dm
     where dm.drink_id = (ln->>'drink_id')::uuid
       and dm.material_id = m.id
       and (dm.takeaway_only = false or (ln->>'service')::service_type = 'takeaway');

    -- الشوت الإضافي يستهلك حبوب المحصول المرتبط بالمشروب
    if (ln->>'shots')::integer > 0 and ln->>'crop_id' is not null then
      update materials
         set stock = stock - (v_shot_grams * (ln->>'shots')::integer * (ln->>'qty')::integer)
       where id = (ln->>'crop_id')::uuid;
    end if;
  end loop;

  return query select v_order_id, v_number, v_total, v_change;
end;
$$;
