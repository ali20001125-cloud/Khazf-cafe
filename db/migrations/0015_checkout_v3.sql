-- =====================================================================
-- 0015 — البيع v3 (المواصفة §13 · §14 · §17 · §18 · §48 · §59 · §60)
--
-- يجب أن يُطبَّق مع 0011: بعده صار مُشغّل الدفتر هو الكاتب الوحيد لـ
-- `cached_stock`، فحُذف التحديث اليدوي من `checkout` و`staff_drink`.
--
-- الجديد فوق checkout v2:
--   • `order_type = SALE` صراحةً بدل الاعتماد على is_staff.
--   • ربط العميل (`customer_id`) → الكسب يقع في نفس المعاملة عبر مُشغّل الولاء (§59).
--   • خصم مسجَّل في `order_discounts` بدل تعديل السعر (§48).
--   • احترام `allow_negative` عند فحص الكفاية (§58).
--   • إعادة التحقّق من المخزون **بعد** قفل الصفوف — كما في v2 (§14).
--   • `checkout/9` القديم يبقى للتوافق ويستدعي النسخة الجديدة.
-- =====================================================================

-- ── النسخة الكاملة (11 وسيطاً) ───────────────────────────────────────
create or replace function checkout(
  p_business_id     uuid,
  p_branch_id       uuid,
  p_employee_id     uuid,
  p_shift_id        uuid,
  p_fulfillment     text,
  p_method          text,
  p_tendered        integer,
  p_idempotency_key text,
  p_items           jsonb,
  p_customer_id     uuid,
  p_discount        jsonb
) returns jsonb
language plpgsql
as $$
declare
  v_item       jsonb;
  v_product_id uuid;
  v_crop       uuid;
  v_qty        integer;
  v_price      integer;
  v_recipe_id  uuid;
  v_coffee     integer;
  v_line_price integer;
  v_grams      integer;
  v_subtotal   integer := 0;
  v_discount   integer := 0;
  v_total      integer;
  v_change     integer := null;
  v_order_id   uuid;
  v_order_no   integer;
  v_takeaway   boolean := (p_fulfillment = 'takeaway');
  v_opt        jsonb;
  v_optrow     modifier_options%rowtype;
  v_swap_from  uuid[];
  v_swap_to    uuid[];
  v_opt_snap   jsonb;
  v_line       record;
  v_item_id    uuid;
  v_eff_mat    uuid;
  v_pos        integer;
  v_ri         record;
  v_dkind      text;
  v_dvalue     integer;
begin
  if p_fulfillment not in ('takeaway','dine_in') then raise exception 'نوع تقديم غير صالح'; end if;
  if p_method not in ('cash','card') then raise exception 'طريقة دفع غير صالحة'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'الطلب فارغ'; end if;

  -- §60 منع التكرار: إعادة الإرسال ترجع نفس النتيجة بلا أثر ثانٍ.
  select o.id, o.order_number, o.total, pay.change
    into v_order_id, v_order_no, v_total, v_change
  from payments pay join orders o on o.id = pay.order_id
  where pay.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
      'total', v_total, 'change', v_change, 'replay', true);
  end if;

  -- §29/§66 القفل الطارئ يُفحص في القاعدة أيضاً، لا في الواجهة وحدها.
  perform 1 from branches where id = p_branch_id and not pos_locked;
  if not found then raise exception 'الكاشير مقفول — راجع المالك'; end if;

  -- تنظيف احترازي: يسمح باستدعاء الدالة أكثر من مرّة في المعاملة الواحدة.
  perform khazaf_drop_temp(array['_lines','_req','_need']);
  create temp table _lines (line_no serial, product_id uuid, crop_material_id uuid, qty integer,
    unit_price integer, recipe_id uuid, coffee_grams integer, options jsonb) on commit drop;
  create temp table _req (material_id uuid, qty integer) on commit drop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_crop       := (v_item->>'crop_material_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'كمية غير صالحة'; end if;

    perform 1 from products where id = v_product_id and business_id = p_business_id and active and not paused;
    if not found then raise exception 'مشروب غير متاح'; end if;

    -- §14: يُباع فقط من محصول متاح، والسعر يُقرأ من القاعدة لا من المتصفح.
    select price into v_price from product_crops
     where product_id = v_product_id and material_id = v_crop and available;
    if not found then raise exception 'محصول غير متاح لهذا المشروب'; end if;

    select id, coffee_grams into v_recipe_id, v_coffee from recipes where product_id = v_product_id and active;
    if not found then raise exception 'لا توجد وصفة فعّالة'; end if;

    v_line_price := v_price;
    v_grams      := v_coffee;
    v_swap_from  := '{}';
    v_swap_to    := '{}';
    v_opt_snap   := '[]'::jsonb;

    if v_item ? 'options' then
      for v_opt in select * from jsonb_array_elements(v_item->'options') loop
        select mo.* into v_optrow
        from modifier_options mo
        join product_modifier_groups pmg on pmg.group_id = mo.group_id
        where mo.id = (v_opt#>>'{}')::uuid and pmg.product_id = v_product_id and mo.available;
        if not found then raise exception 'خيار غير متاح'; end if;

        v_line_price := v_line_price + v_optrow.price_delta;
        if v_optrow.add_to_crop_grams then
          v_grams := v_grams + v_optrow.qty;
        elsif v_optrow.replaces_base_material_id is not null then
          v_swap_from := array_append(v_swap_from, v_optrow.replaces_base_material_id);
          v_swap_to   := array_append(v_swap_to,   v_optrow.material_id);
        elsif v_optrow.material_id is not null and v_optrow.qty > 0 then
          insert into _req values (v_optrow.material_id, v_optrow.qty * v_qty);
        end if;
        v_opt_snap := v_opt_snap || jsonb_build_object(
          'option_id', v_optrow.id, 'name', v_optrow.name, 'price_delta', v_optrow.price_delta);
      end loop;
    end if;

    if v_grams > 0 then insert into _req values (v_crop, v_grams * v_qty); end if;

    -- §31: الكميات من الوصفة، لا يُدخلها الباريستا.
    for v_ri in select material_id, qty, only_takeaway from recipe_items where recipe_id = v_recipe_id loop
      if (not v_takeaway) and v_ri.only_takeaway then continue; end if;
      v_eff_mat := v_ri.material_id;
      v_pos := array_position(v_swap_from, v_ri.material_id);
      if v_pos is not null then v_eff_mat := v_swap_to[v_pos]; end if;
      insert into _req values (v_eff_mat, v_ri.qty * v_qty);
    end loop;

    v_subtotal := v_subtotal + v_line_price * v_qty;
    insert into _lines (product_id, crop_material_id, qty, unit_price, recipe_id, coffee_grams, options)
      values (v_product_id, v_crop, v_qty, v_line_price, v_recipe_id, v_grams, v_opt_snap);
  end loop;

  create temp table _need on commit drop as
    select material_id, sum(qty)::integer as qty from _req group by material_id;

  -- §13/§14: قفل صفوف المواد ثم إعادة التحقّق — يمنع البيع المزدوج والسالب.
  perform 1 from materials m join _need n on n.material_id = m.id order by m.id for update;
  if exists (select 1 from _need n join materials m on m.id = n.material_id
              where not m.active or (m.cached_stock < n.qty and not m.allow_negative)) then
    raise exception 'المخزون لا يكفي لإتمام الطلب';
  end if;

  -- §48: الخصم يُحسب في القاعدة ويُسجَّل كوثيقة، ولا يُعدَّل سعر البند.
  if p_discount is not null and p_discount ? 'kind' then
    v_dkind  := p_discount->>'kind';
    v_dvalue := coalesce((p_discount->>'value')::integer, 0);
    v_discount := case v_dkind
      when 'PERCENT' then round(v_subtotal::numeric * least(greatest(v_dvalue,0),100) / 100)::integer
      when 'AMOUNT'  then least(greatest(v_dvalue,0), v_subtotal)
      when 'COMP'    then v_subtotal
      else 0 end;
    if coalesce(p_discount->>'reason','') = '' then raise exception 'الخصم يحتاج سبباً (§48)'; end if;
  end if;

  v_total := v_subtotal - v_discount;

  -- §17: لا إغلاق إذا المدفوع أقل من المطلوب.
  if p_method = 'cash' then
    if p_tendered is null or p_tendered < v_total then raise exception 'المبلغ المدفوع أقل من الإجمالي'; end if;
    v_change := p_tendered - v_total;
  end if;

  -- §19: رقم الفاتورة عدّاد لكل فرع، يتقدّم بعد اجتياز كل التحقّقات (بلا فجوات).
  update order_counters set next_number = next_number + 1 where branch_id = p_branch_id
    returning next_number - 1 into v_order_no;
  if v_order_no is null then raise exception 'الفرع غير مهيّأ (order_counters)'; end if;

  insert into orders (business_id, branch_id, order_number, shift_id, employee_id, customer_id,
                      status, order_type, fulfillment, subtotal, discount, total, paid_at, completed_at)
  values (p_business_id, p_branch_id, v_order_no, p_shift_id, p_employee_id, p_customer_id,
          'COMPLETED', 'SALE', p_fulfillment::fulfillment_type,
          v_subtotal, v_discount, v_total, now(), now())
  returning id into v_order_id;

  for v_line in select * from _lines order by line_no loop
    -- §10: لقطة الوصفة تُجمَّد مع البند — تغيير الوصفة لاحقاً لا يمسّ التاريخ.
    insert into order_items (order_id, product_id, crop_material_id, unit_price, qty, recipe_snapshot, is_free)
    values (v_order_id, v_line.product_id, v_line.crop_material_id, v_line.unit_price, v_line.qty,
      jsonb_build_object('coffee_grams', v_line.coffee_grams, 'crop_material_id', v_line.crop_material_id,
        'takeaway', v_takeaway, 'options', v_line.options,
        'items', (select coalesce(jsonb_agg(jsonb_build_object(
                            'material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
                  from recipe_items ri where ri.recipe_id = v_line.recipe_id)),
      false)
    returning id into v_item_id;

    insert into order_item_modifiers (order_item_id, option_id, name, price_delta)
    select v_item_id, (o->>'option_id')::uuid, o->>'name', (o->>'price_delta')::integer
    from jsonb_array_elements(v_line.options) o;
  end loop;

  if v_discount > 0 then
    insert into order_discounts (order_id, kind, value, amount, original_total, final_total,
                                 reason, applied_by, approved_by)
    values (v_order_id, v_dkind::discount_kind, coalesce(v_dvalue,0), v_discount, v_subtotal, v_total,
            p_discount->>'reason', p_employee_id, nullif(p_discount->>'approved_by','')::uuid);
  end if;

  insert into payments (order_id, method, amount, tendered, change, status, idempotency_key)
  values (v_order_id, p_method::payment_method, v_total, p_tendered, v_change, 'CONFIRMED', p_idempotency_key);

  -- الدفتر فقط — cached_stock يطبّقه inv_txn_apply_stock (0011).
  insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, reason, order_id, user_id)
  select p_business_id, p_branch_id, n.material_id, 'SALE', -n.qty, 'بيع', v_order_id, p_employee_id
  from _need n;

  if p_method = 'cash' and p_shift_id is not null then
    insert into cash_movements (shift_id, branch_id, type, amount, reason, user_id)
    values (p_shift_id, p_branch_id, 'SALE', v_total, 'بيع', p_employee_id);
  end if;

  -- كسب الولاء وقع داخل هذه المعاملة عبر مُشغّل orders_loyalty_earn (§59).
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
    'total', v_total, 'discount', v_discount, 'change', v_change, 'replay', false);
end;
$$;

-- ── التوقيع القديم (9 وسائط) — توافق رجعي مع كود التطبيق الحالي ─────
create or replace function checkout(
  p_business_id     uuid,
  p_branch_id       uuid,
  p_employee_id     uuid,
  p_shift_id        uuid,
  p_fulfillment     text,
  p_method          text,
  p_tendered        integer,
  p_idempotency_key text,
  p_items           jsonb
) returns jsonb
language sql as $$
  select checkout(p_business_id, p_branch_id, p_employee_id, p_shift_id, p_fulfillment,
                  p_method, p_tendered, p_idempotency_key, p_items, null::uuid, null::jsonb);
$$;

-- ── مشروب الموظف (§30 · §31) بلا تحديث يدوي للرصيد ──────────────────
create or replace function staff_drink(
  p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_shift_id uuid,
  p_product_id uuid, p_crop uuid, p_fulfillment text, p_approved_by uuid
) returns jsonb
language plpgsql as $$
declare
  v_recipe_id uuid;
  v_coffee    integer;
  v_takeaway  boolean := (p_fulfillment = 'takeaway');
  v_order_id  uuid;
  v_order_no  integer;
begin
  if p_fulfillment not in ('takeaway','dine_in') then raise exception 'نوع تقديم غير صالح'; end if;

  perform 1 from products where id = p_product_id and business_id = p_business_id and active;
  if not found then raise exception 'مشروب غير متاح'; end if;
  perform 1 from product_crops where product_id = p_product_id and material_id = p_crop and available;
  if not found then raise exception 'محصول غير متاح'; end if;

  select id, coffee_grams into v_recipe_id, v_coffee
    from recipes where product_id = p_product_id and active;
  if not found then raise exception 'لا وصفة فعّالة'; end if;

  perform khazaf_drop_temp(array['_need','_agg']);
  create temp table _need on commit drop as
    select p_crop as material_id, (v_coffee)::integer as qty where v_coffee > 0;
  insert into _need (material_id, qty)
    select ri.material_id, ri.qty from recipe_items ri
    where ri.recipe_id = v_recipe_id and (v_takeaway or not ri.only_takeaway);

  create temp table _agg on commit drop as
    select material_id, sum(qty)::integer as qty from _need group by material_id;

  perform 1 from materials m join _agg n on n.material_id = m.id order by m.id for update;
  if exists (select 1 from _agg n join materials m on m.id = n.material_id
              where not m.active or (m.cached_stock < n.qty and not m.allow_negative)) then
    raise exception 'المخزون لا يكفي';
  end if;

  update order_counters set next_number = next_number + 1 where branch_id = p_branch_id
    returning next_number - 1 into v_order_no;
  if v_order_no is null then raise exception 'الفرع غير مهيّأ (order_counters)'; end if;

  insert into orders (business_id, branch_id, order_number, shift_id, employee_id,
                      status, order_type, fulfillment, is_staff, subtotal, discount, total,
                      paid_at, completed_at)
  values (p_business_id, p_branch_id, v_order_no, p_shift_id, p_employee_id,
          'COMPLETED', 'STAFF_DRINK', p_fulfillment::fulfillment_type, true, 0, 0, 0, now(), now())
  returning id into v_order_id;

  insert into order_items (order_id, product_id, crop_material_id, unit_price, qty, recipe_snapshot, is_free)
  values (v_order_id, p_product_id, p_crop, 0, 1,
    jsonb_build_object('coffee_grams', v_coffee, 'crop_material_id', p_crop, 'takeaway', v_takeaway,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                          'material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
                from recipe_items ri where ri.recipe_id = v_recipe_id)),
    true);

  insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, reason, order_id, user_id)
  select p_business_id, p_branch_id, n.material_id, 'STAFF', -n.qty, 'مشروب موظف', v_order_id, p_employee_id
  from _agg n;

  insert into audit_log (business_id, branch_id, user_id, approved_by, action, entity_type, entity_id, reason)
  values (p_business_id, p_branch_id, p_employee_id, p_approved_by, 'staff_drink', 'order', v_order_id,
          case when p_approved_by is null then 'ضمن الحدّ' else 'بموافقة المالك (تجاوز الحدّ)' end);

  return jsonb_build_object('order_number', v_order_no);
end;
$$;
