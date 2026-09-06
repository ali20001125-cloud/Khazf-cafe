-- =====================================================================
-- V2-A — checkout v2: يدعم خيارات/إضافات المشروب.
-- p_items: [{product_id, crop_material_id, qty, options:[option_id,...]}]
--   • السعر = سعر المحصول + Σ(price_delta للخيارات).
--   • المخزون = وصفة الأساس معدّلة:
--       - add_to_crop_grams: يضيف qty لغرامات المحصول المختار (شوت).
--       - replaces_base_material_id: يستبدل مادة الوصفة بمادة الخيار (حليب).
--       - material_id + qty: يضيف مادة (سيروب).
--   • متوافق رجعياً: بند بلا options يسلك كما قبل.
-- نفس الذرّية: منع تكرار · قفل صفوف · منع سالب · دفتر · كاش.
-- =====================================================================

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
begin
  if p_fulfillment not in ('takeaway','dine_in') then raise exception 'نوع تقديم غير صالح'; end if;
  if p_method not in ('cash','card') then raise exception 'طريقة دفع غير صالحة'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'الطلب فارغ'; end if;

  -- منع التكرار
  select o.id, o.order_number, o.total, pay.change
    into v_order_id, v_order_no, v_total, v_change
  from payments pay join orders o on o.id = pay.order_id
  where pay.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
      'total', v_total, 'change', v_change, 'replay', true);
  end if;

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
    select price into v_price from product_crops where product_id = v_product_id and material_id = v_crop and available;
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
        v_opt_snap := v_opt_snap || jsonb_build_object('option_id', v_optrow.id, 'name', v_optrow.name, 'price_delta', v_optrow.price_delta);
      end loop;
    end if;

    if v_grams > 0 then insert into _req values (v_crop, v_grams * v_qty); end if;

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

  perform 1 from materials m join _need n on n.material_id = m.id order by m.id for update;
  if exists (select 1 from _need n join materials m on m.id = n.material_id where not m.active or m.cached_stock < n.qty) then
    raise exception 'المخزون لا يكفي لإتمام الطلب';
  end if;

  v_total := v_subtotal;
  if p_method = 'cash' then
    if p_tendered is null or p_tendered < v_total then raise exception 'المبلغ المدفوع أقل من الإجمالي'; end if;
    v_change := p_tendered - v_total;
  end if;

  update order_counters set next_number = next_number + 1 where branch_id = p_branch_id
    returning next_number - 1 into v_order_no;
  if v_order_no is null then raise exception 'الفرع غير مهيّأ (order_counters)'; end if;

  insert into orders (business_id, branch_id, order_number, shift_id, employee_id,
                      status, fulfillment, subtotal, discount, total, paid_at, completed_at)
  values (p_business_id, p_branch_id, v_order_no, p_shift_id, p_employee_id,
          'COMPLETED', p_fulfillment::fulfillment_type, v_subtotal, 0, v_total, now(), now())
  returning id into v_order_id;

  for v_line in select * from _lines order by line_no loop
    insert into order_items (order_id, product_id, crop_material_id, unit_price, qty, recipe_snapshot, is_free)
    values (v_order_id, v_line.product_id, v_line.crop_material_id, v_line.unit_price, v_line.qty,
      jsonb_build_object('coffee_grams', v_line.coffee_grams, 'crop_material_id', v_line.crop_material_id,
        'takeaway', v_takeaway, 'options', v_line.options,
        'items', (select coalesce(jsonb_agg(jsonb_build_object('material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
                  from recipe_items ri where ri.recipe_id = v_line.recipe_id)),
      false)
    returning id into v_item_id;

    insert into order_item_modifiers (order_item_id, option_id, name, price_delta)
    select v_item_id, (o->>'option_id')::uuid, o->>'name', (o->>'price_delta')::integer
    from jsonb_array_elements(v_line.options) o;
  end loop;

  insert into payments (order_id, method, amount, tendered, change, status, idempotency_key)
  values (v_order_id, p_method::payment_method, v_total, p_tendered, v_change, 'CONFIRMED', p_idempotency_key);

  insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, reason, order_id, user_id)
  select p_business_id, p_branch_id, n.material_id, 'SALE', -n.qty, 'بيع', v_order_id, p_employee_id
  from _need n;

  update materials m set cached_stock = m.cached_stock - n.qty from _need n where n.material_id = m.id;

  if p_method = 'cash' and p_shift_id is not null then
    insert into cash_movements (shift_id, type, amount, reason, user_id)
    values (p_shift_id, 'SALE', v_total, 'بيع', p_employee_id);
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
    'total', v_total, 'change', v_change, 'replay', false);
end;
$$;
