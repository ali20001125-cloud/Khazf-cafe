-- =====================================================================
-- مشروب الموظف (§5.5) — دالة ذرّية
-- سعر 0 · يخصم المخزون كنوع STAFF (لا SALE) · طلب is_staff · لا دفع ولا كاش.
-- حدّ الوردية والموافقة يُفحصان في طبقة التطبيق قبل الاستدعاء.
-- =====================================================================

create or replace function staff_drink(
  p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_shift_id uuid,
  p_product_id uuid, p_crop uuid, p_fulfillment text, p_approved_by uuid
) returns jsonb
language plpgsql as $$
declare
  v_recipe_id uuid;
  v_coffee integer;
  v_takeaway boolean := (p_fulfillment = 'takeaway');
  v_order_id uuid;
  v_order_no integer;
begin
  if p_fulfillment not in ('takeaway','dine_in') then raise exception 'نوع تقديم غير صالح'; end if;

  perform 1 from products where id = p_product_id and business_id = p_business_id and active;
  if not found then raise exception 'مشروب غير متاح'; end if;
  perform 1 from product_crops where product_id = p_product_id and material_id = p_crop and available;
  if not found then raise exception 'محصول غير متاح'; end if;

  select id, coffee_grams into v_recipe_id, v_coffee
    from recipes where product_id = p_product_id and active;
  if not found then raise exception 'لا وصفة فعّالة'; end if;

  create temp table _need on commit drop as
    select p_crop as material_id, (v_coffee)::integer as qty where v_coffee > 0;
  insert into _need (material_id, qty)
    select ri.material_id, ri.qty from recipe_items ri
    where ri.recipe_id = v_recipe_id and (v_takeaway or not ri.only_takeaway);

  -- دمج التكرار (لو المحصول ظهر مرتين) + قفل وتحقّق
  create temp table _agg on commit drop as
    select material_id, sum(qty)::integer as qty from _need group by material_id;
  perform 1 from materials m join _agg n on n.material_id = m.id order by m.id for update;
  if exists (select 1 from _agg n join materials m on m.id = n.material_id where not m.active or m.cached_stock < n.qty) then
    raise exception 'المخزون لا يكفي';
  end if;

  update order_counters set next_number = next_number + 1 where branch_id = p_branch_id
    returning next_number - 1 into v_order_no;

  insert into orders (business_id, branch_id, order_number, shift_id, employee_id,
                      status, fulfillment, is_staff, subtotal, discount, total, paid_at, completed_at)
  values (p_business_id, p_branch_id, v_order_no, p_shift_id, p_employee_id,
          'COMPLETED', p_fulfillment::fulfillment_type, true, 0, 0, 0, now(), now())
  returning id into v_order_id;

  insert into order_items (order_id, product_id, crop_material_id, unit_price, qty, recipe_snapshot, is_free)
  values (v_order_id, p_product_id, p_crop, 0, 1,
    jsonb_build_object('coffee_grams', v_coffee, 'crop_material_id', p_crop, 'takeaway', v_takeaway,
      'items', (select coalesce(jsonb_agg(jsonb_build_object('material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
                from recipe_items ri where ri.recipe_id = v_recipe_id)),
    true);

  insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, reason, order_id, user_id)
  select p_business_id, p_branch_id, n.material_id, 'STAFF', -n.qty, 'مشروب موظف', v_order_id, p_employee_id
  from _agg n;

  update materials m set cached_stock = m.cached_stock - n.qty from _agg n where n.material_id = m.id;

  insert into audit_log (business_id, branch_id, user_id, approved_by, action, entity_type, entity_id, reason)
  values (p_business_id, p_branch_id, p_employee_id, p_approved_by, 'staff_drink', 'order', v_order_id,
          case when p_approved_by is null then 'ضمن الحدّ' else 'بموافقة المالك (تجاوز الحدّ)' end);

  return jsonb_build_object('order_number', v_order_no);
end;
$$;
