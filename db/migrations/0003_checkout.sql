-- =====================================================================
-- م٣ — الدفع الذرّي  ·  قلب النظام
-- المرجع: CAFE-POS-TECH.md §دورة حياة الدفع (Atomic).
-- دالة واحدة = معاملة واحدة: إمّا كل شيء أو لا شيء.
--   1) منع التكرار (idempotency).
--   2) تحقّق المنتجات/المحاصيل/الوصفات + تجميع المواد المطلوبة.
--   3) قفل صفوف المواد وإعادة التحقّق من كفاية الرصيد (منع مخزون سالب/سباق).
--   4) رقم طلب ذرّي + طلب + بنود (بلقطة وصفة) + دفعة مؤكّدة.
--   5) حركات مخزون SALE (سالبة) + تحديث cached_stock.
--   6) حركة كاش SALE للوردية (إن كاش ووردية موجودة).
-- الفلوس والكميات أعداد صحيحة. لا حالة نصفية.
-- =====================================================================

create or replace function checkout(
  p_business_id     uuid,
  p_branch_id       uuid,
  p_employee_id     uuid,
  p_shift_id        uuid,        -- قد يكون null (الورديات في م٤)
  p_fulfillment     text,        -- 'takeaway' | 'dine_in'
  p_method          text,        -- 'cash' | 'card'
  p_tendered        integer,     -- المدفوع كاش (null للبطاقة)
  p_idempotency_key text,
  p_items           jsonb        -- [{product_id, crop_material_id, qty}]
) returns jsonb
language plpgsql
as $$
declare
  v_item        jsonb;
  v_product_id  uuid;
  v_crop        uuid;
  v_qty         integer;
  v_price       integer;
  v_recipe_id   uuid;
  v_coffee      integer;
  v_subtotal    integer := 0;
  v_total       integer;
  v_change      integer := null;
  v_order_id    uuid;
  v_order_no    integer;
  v_takeaway    boolean := (p_fulfillment = 'takeaway');
begin
  if p_fulfillment not in ('takeaway','dine_in') then
    raise exception 'نوع تقديم غير صالح';
  end if;
  if p_method not in ('cash','card') then
    raise exception 'طريقة دفع غير صالحة';
  end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'الطلب فارغ';
  end if;

  -- 1) منع التكرار: لو المفتاح مستخدم، أعِد نتيجة الطلب السابق بلا خصم جديد.
  select o.id, o.order_number, o.total, pay.change
    into v_order_id, v_order_no, v_total, v_change
  from payments pay join orders o on o.id = pay.order_id
  where pay.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
      'total', v_total, 'change', v_change, 'replay', true);
  end if;

  create temp table _lines (
    product_id uuid, crop_material_id uuid, qty integer,
    unit_price integer, recipe_id uuid, coffee_grams integer
  ) on commit drop;
  create temp table _req (material_id uuid, qty integer) on commit drop;

  -- 2) تحقّق + تسعير + تجميع المواد
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_crop       := (v_item->>'crop_material_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'كمية غير صالحة'; end if;

    perform 1 from products
      where id = v_product_id and business_id = p_business_id and active and not paused;
    if not found then raise exception 'مشروب غير متاح'; end if;

    select price into v_price from product_crops
      where product_id = v_product_id and material_id = v_crop and available;
    if not found then raise exception 'محصول غير متاح لهذا المشروب'; end if;

    select id, coffee_grams into v_recipe_id, v_coffee
      from recipes where product_id = v_product_id and active;
    if not found then raise exception 'لا توجد وصفة فعّالة'; end if;

    insert into _lines values (v_product_id, v_crop, v_qty, v_price, v_recipe_id, v_coffee);
    v_subtotal := v_subtotal + v_price * v_qty;

    -- حبوب المحصول المختار
    if v_coffee > 0 then
      insert into _req values (v_crop, v_coffee * v_qty);
    end if;
    -- مواد الوصفة (حليب دائماً · كوب/غطاء للسفري فقط)
    insert into _req (material_id, qty)
      select ri.material_id, ri.qty * v_qty
      from recipe_items ri
      where ri.recipe_id = v_recipe_id and (v_takeaway or not ri.only_takeaway);
  end loop;

  create temp table _need on commit drop as
    select material_id, sum(qty)::integer as qty from _req group by material_id;

  -- 3) قفل صفوف المواد بترتيب ثابت ثم إعادة التحقّق من الكفاية
  perform 1 from materials m join _need n on n.material_id = m.id
    order by m.id for update;
  if exists (
    select 1 from _need n join materials m on m.id = n.material_id
    where not m.active or m.cached_stock < n.qty
  ) then
    raise exception 'المخزون لا يكفي لإتمام الطلب';
  end if;

  -- الإجمالي والدفع
  v_total := v_subtotal;
  if p_method = 'cash' then
    if p_tendered is null or p_tendered < v_total then
      raise exception 'المبلغ المدفوع أقل من الإجمالي';
    end if;
    v_change := p_tendered - v_total;
  end if;

  -- 4) رقم طلب ذرّي
  update order_counters set next_number = next_number + 1
    where branch_id = p_branch_id
    returning next_number - 1 into v_order_no;
  if v_order_no is null then raise exception 'الفرع غير مهيّأ (order_counters)'; end if;

  insert into orders (business_id, branch_id, order_number, shift_id, employee_id,
                      status, fulfillment, subtotal, discount, total, paid_at, completed_at)
  values (p_business_id, p_branch_id, v_order_no, p_shift_id, p_employee_id,
          'COMPLETED', p_fulfillment::fulfillment_type, v_subtotal, 0, v_total, now(), now())
  returning id into v_order_id;

  insert into order_items (order_id, product_id, crop_material_id, unit_price, qty, recipe_snapshot, is_free)
  select v_order_id, l.product_id, l.crop_material_id, l.unit_price, l.qty,
    jsonb_build_object(
      'coffee_grams', l.coffee_grams,
      'crop_material_id', l.crop_material_id,
      'takeaway', v_takeaway,
      'items', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
        from recipe_items ri where ri.recipe_id = l.recipe_id
      )
    ),
    false
  from _lines l;

  -- الدفعة (قيد التفرّد على idempotency_key يحمي من السباق)
  insert into payments (order_id, method, amount, tendered, change, status, idempotency_key)
  values (v_order_id, p_method::payment_method, v_total, p_tendered, v_change, 'CONFIRMED', p_idempotency_key);

  -- 5) خصم المخزون عبر الدفتر + تحديث cached_stock
  insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, reason, order_id, user_id)
  select p_business_id, p_branch_id, n.material_id, 'SALE', -n.qty, 'بيع', v_order_id, p_employee_id
  from _need n;

  update materials m set cached_stock = m.cached_stock - n.qty
  from _need n where n.material_id = m.id;

  -- 6) حركة كاش للوردية (إن كاش ووردية)
  if p_method = 'cash' and p_shift_id is not null then
    insert into cash_movements (shift_id, type, amount, reason, user_id)
    values (p_shift_id, 'SALE', v_total, 'بيع', p_employee_id);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
    'total', v_total, 'change', v_change, 'replay', false);
end;
$$;
