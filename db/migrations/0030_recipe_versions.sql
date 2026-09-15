-- =====================================================================
-- 0030 · نسخ الوصفة: التعديل يصنع نسخةً جديدة ولا يمسح القديمة
--
-- الفاتورة محفوظةٌ بوصفتها أصلاً (`order_items.recipe_snapshot`)، فالتاريخ
-- المالي سليم. الناقص سؤالٌ آخر يسأله المالك بعد شهرين: **متى غيّرنا
-- اللاتيه من ١٨٠ إلى ٢٠٠؟** تعديلٌ يكتب فوق الصفّ لا يجيب عنه أبداً.
--
-- وهذا أيضاً السبب في أن التعديل هنا دالّة واحدة لا عدّة جُمل من الخادم:
-- «عطّل القديمة» و«أدرِج الجديدة» يجب أن تقعا معاً أو لا تقعا — وبينهما
-- فهرسٌ يمنع وصفتين فعّالتين، فانقطاعٌ في المنتصف يترك المشروب بلا وصفة.
-- =====================================================================

create or replace function set_recipe(
  p_business_id uuid, p_product_id uuid, p_user_id uuid,
  p_coffee_grams integer, p_items jsonb
) returns jsonb
language plpgsql as $fn$
declare
  v_old_id      uuid;
  v_old_grams   integer;
  v_old_items   jsonb;
  v_new_items   jsonb;
  v_version     integer;
  v_new_id      uuid;
begin
  if p_coffee_grams is null or p_coffee_grams < 0 then
    raise exception 'غرامات غير صالحة';
  end if;

  perform 1 from products where id = p_product_id and business_id = p_business_id;
  if not found then raise exception 'مشروب غير موجود'; end if;

  select r.id, r.coffee_grams into v_old_id, v_old_grams
  from recipes r where r.product_id = p_product_id and r.active;

  -- الوصفة مقارَنةً كمجموعة مرتّبة، فإعادة ترتيب الصفوف ليست «تغييراً»
  select coalesce(jsonb_agg(x order by x->>'material_id'), '[]'::jsonb) into v_old_items
  from (
    select jsonb_build_object('material_id', ri.material_id, 'qty', ri.qty,
                              'only_takeaway', ri.only_takeaway) as x
    from recipe_items ri where ri.recipe_id = v_old_id
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
           'material_id', (i->>'material_id')::uuid,
           'qty', (i->>'qty')::integer,
           'only_takeaway', coalesce((i->>'only_takeaway')::boolean, false))
         order by i->>'material_id'), '[]'::jsonb)
    into v_new_items
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
  where (i->>'qty')::integer > 0;

  -- لا نسخة بلا تغيير: نسخٌ فارغة تُغرق التاريخ فيصير غير مقروء
  if v_old_id is not null and v_old_grams = p_coffee_grams and v_old_items = v_new_items then
    return jsonb_build_object('changed', false,
             'version', (select version from recipes where id = v_old_id));
  end if;

  select coalesce(max(version), 0) + 1 into v_version from recipes where product_id = p_product_id;

  update recipes set active = false where id = v_old_id;

  insert into recipes (product_id, version, coffee_grams, active)
  values (p_product_id, v_version, p_coffee_grams, true)
  returning id into v_new_id;

  insert into recipe_items (recipe_id, material_id, qty, only_takeaway)
  select v_new_id, (i->>'material_id')::uuid, (i->>'qty')::integer,
         coalesce((i->>'only_takeaway')::boolean, false)
  from jsonb_array_elements(v_new_items) i;

  insert into audit_log (business_id, user_id, action, entity_type, entity_id,
                         before, after, reason)
  values (p_business_id, p_user_id, 'recipe_change', 'product', p_product_id,
          jsonb_build_object('coffee_grams', v_old_grams, 'items', v_old_items),
          jsonb_build_object('coffee_grams', p_coffee_grams, 'items', v_new_items),
          format('وصفة جديدة — نسخة %s', v_version));

  return jsonb_build_object('changed', true, 'version', v_version, 'recipe_id', v_new_id);
end;
$fn$;

comment on function set_recipe(uuid,uuid,uuid,integer,jsonb) is
  'تعديل الوصفة بنسخةٍ جديدة. القديمة تُعطَّل ولا تُمحى، والتغيير يُكتب في سجلّ التدقيق.';

-- تاريخ وصفات مشروب — «متى صار ٢٠٠ مل؟» يُجاب عنه بصفٍّ لا بذاكرة أحد.
create or replace view v_recipe_history as
  select r.product_id, p.name as product_name, p.business_id,
         r.id as recipe_id, r.version, r.active, r.coffee_grams, r.created_at,
         (select coalesce(jsonb_agg(jsonb_build_object(
                   'material', m.name, 'qty', ri.qty,
                   'only_takeaway', ri.only_takeaway) order by m.name), '[]'::jsonb)
          from recipe_items ri join materials m on m.id = ri.material_id
          where ri.recipe_id = r.id) as items
  from recipes r join products p on p.id = r.product_id
  order by p.name, r.version desc;

comment on view v_recipe_history is 'كل نسخ الوصفة لكل مشروب، الأحدث أولاً.';
