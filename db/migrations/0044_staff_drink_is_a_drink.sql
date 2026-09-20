-- =====================================================================
-- 0044 · «مشروب موظف» مشروبٌ لا بضاعة
--
-- وجد المالك أنّ الباريستا يستطيع اختيار **كيس بنّ** كمشروب موظف.
-- وهذا ليس خطأ عرضٍ بل ثغرة: كيسٌ يُباع بخمسة وعشرين ألفاً يخرج
-- مجّاناً تحت بندٍ اسمه «ضيافة»، ويُخصم من مخزون البيع بلا إيراد
-- مقابله. والحدّ اليوميّ لا يردعه — مشروبٌ واحد مسموحٌ في الوردية،
-- وثمنه هنا ربع كيلو بنّ.
--
-- كان الفحص `products ... and active` فقط: يتأكّد أنّ المنتج موجودٌ
-- ويعمل، ولا يسأل **ما هو**. وعمود `kind` قائمٌ منذ هجرة 0039 ولم
-- يُسأل عنه هنا.
--
-- والحارس في القاعدة لا في الشاشة وحدها: إخفاء الصنف من القائمة لا
-- يمنع طلباً يُرسَل بمعرّفه مباشرةً، والدالّة هي آخر باب.
--
-- ما دون ذلك من جسم الدالّة منسوخٌ حرفيّاً عن القائم: القفل على صفوف
-- المواد، و`allow_negative`، وعدّاد أرقام الفواتير، ولقطة الوصفة،
-- وسطر التدقيق. أوّل محاولةٍ لي أعادت كتابته من الذاكرة فأسقطت هذه
-- كلّها — وكشفها `diff` قبل أن تُدفع.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.staff_drink(p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_shift_id uuid, p_product_id uuid, p_crop uuid, p_fulfillment text, p_approved_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  v_recipe_id uuid;
  v_coffee    integer;
  v_takeaway  boolean := (p_fulfillment = 'takeaway');
  v_order_id  uuid;
  v_order_no  integer;
  v_kind      text;
begin
  if p_fulfillment not in ('takeaway','dine_in') then raise exception 'نوع تقديم غير صالح'; end if;

  select kind into v_kind from products
   where id = p_product_id and business_id = p_business_id and active;
  if not found then raise exception 'مشروب غير متاح'; end if;
  -- **التغيير الوحيد**: البضاعة تُباع ولا تُشرب
  if v_kind <> 'drink' then
    raise exception 'مشروبات الموظفين للمشروبات وحدها — لا للبضاعة';
  end if;
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
$function$
