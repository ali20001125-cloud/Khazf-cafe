-- الموكا بشوكولاتته، والتقطير صار كيميكس.
--
-- قال المالك: «الموكا مع شوكولاتة، إضافةً للحليب». وكانت وصفتا الموكا
-- والآيس موكا بلا شوكولاتة أصلاً — فكلفتهما في التقارير أقلّ من
-- الحقيقة، والصوص يُستهلك ولا يُحسب. فمادّةٌ جديدة «صوص شوكولاتة» بلا
-- تكلفةٍ بعد (يظهر تنبيهها حتى أوّل شراء)، تُضاف بـ ٢٥ مل تقديراً عبر
-- `set_recipe` — نسخةٌ جديدة من الوصفة لا كتابةٌ فوق القديمة.
--
-- و«التقطير هو نفسه V60» — فصار **كيميكس** بالمحاصيل نفسها. إعادة
-- تسميةٍ لا حذف: لا بيع عليه بعد، والوصفة والسعر ينتقلان كما هما.

do $$
declare
  v_biz uuid; v_owner uuid; v_choc uuid; v_dorado uuid;
  r record;
  v_items jsonb;
begin
  select id into v_biz from businesses order by created_at limit 1;
  if v_biz is null then return; end if;
  select id into v_owner from users where business_id = v_biz and role = 'owner' and active
   order by created_at limit 1;

  select id into v_choc from materials where business_id = v_biz and name = 'صوص شوكولاتة';
  if v_choc is null then
    insert into materials (business_id, name, base_unit, low_threshold, current_cost,
                           menu_label, menu_label_en)
    values (v_biz, 'صوص شوكولاتة', 'ml', 300, 0, 'شوكولاتة', 'Chocolate')
    returning id into v_choc;
  end if;

  for r in
    select p.id, rc.coffee_grams, rc.id as rid
    from products p join recipes rc on rc.product_id = p.id and rc.active
    where p.business_id = v_biz and p.active and p.name in ('موكا', 'آيس موكا')
      and not exists (select 1 from recipe_items ri where ri.recipe_id = rc.id and ri.material_id = v_choc)
  loop
    select coalesce(jsonb_agg(jsonb_build_object(
             'material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
      into v_items
      from recipe_items ri where ri.recipe_id = r.rid;
    v_items := v_items || jsonb_build_array(jsonb_build_object(
                 'material_id', v_choc, 'qty', 25, 'only_takeaway', false));
    perform set_recipe(v_biz, r.id, v_owner, r.coffee_grams, v_items);
  end loop;

  update products set
    menu_ingredients    = 'إسبريسو · حليب مبخّر مع شوكولاتة',
    menu_ingredients_en = 'Espresso · Steamed milk with chocolate'
  where business_id = v_biz and active and name = 'موكا';
  update products set
    menu_ingredients    = 'إسبريسو · حليب بارد مع شوكولاتة · ثلج',
    menu_ingredients_en = 'Espresso · Cold milk with chocolate · Ice'
  where business_id = v_biz and active and name = 'آيس موكا';

  -- التقطير ← كيميكس
  update products set
    name = 'كيميكس', name_en = 'Chemex',
    menu_ingredients = 'قهوة مقطّرة بالكيميكس',
    menu_ingredients_en = 'Chemex filter coffee'
  where business_id = v_biz and active and kind = 'drink' and name = 'تقطير'
    and not exists (select 1 from products where business_id = v_biz and active and name = 'كيميكس');

  -- بنّ الفلتر نفسه الذي في V60
  select id into v_dorado from materials where business_id = v_biz and name = 'حبوب الدورادو';
  if v_dorado is not null then
    insert into product_crops (product_id, material_id, price, available)
    select p.id, v_dorado, 6000, true
    from products p where p.business_id = v_biz and p.active and p.name = 'كيميكس'
    on conflict (product_id, material_id) do nothing;
  end if;
end $$;
