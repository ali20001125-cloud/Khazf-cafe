-- =====================================================================
-- 0036 · الكوب يتبع المشروب لا العكس
--
-- قال المالك: «المشروبات تُباع بأكواب سيراميك. للسفري ورقية للساخن،
-- بلاستك للبارد».
--
-- فالسيراميك لا يُستهلك — يُغسل ويعود — فلا مكان له في المخزون أصلاً،
-- وتتبّعه يُنتج فرق جردٍ لا معنى له في كل عدّة.
-- أما السفري فيُستهلك، وهو كوبان لا كوب: ورقيّ للساخن وبلاستك للبارد.
-- كوبٌ واحد باسم «كوب سفري» يُخفي أن الاثنين يَنفدان في أوقاتٍ مختلفة،
-- فيُشترى أحدهما ويقف البيع عند الآخر.
--
-- المادتان القديمتان تُعاد تسميتهما إلى الورقيّ لأن رصيدهما ودفترهما
-- يخصّان الساخن؛ وتُضاف مادتا البلاستك، وتُنقل إليهما وصفات البارد.
-- =====================================================================

do $mig$
declare
  v_biz     uuid;
  v_own     uuid;
  v_cup_p   uuid;   -- كوب بلاستك
  v_lid_p   uuid;   -- غطاء بلاستك
  v_prod    record;
  v_items   jsonb;
begin
  select id into v_biz from businesses order by created_at limit 1;
  if v_biz is null then return; end if;
  select id into v_own from users where business_id = v_biz and role = 'owner' limit 1;

  -- ١) القديم صار الورقيّ (الساخن) — مع حفظ رصيده ودفتره
  update materials set name = 'كوب ورقي'
   where business_id = v_biz and name = 'كوب سفري';
  update materials set name = 'غطاء ورقي'
   where business_id = v_biz and name = 'غطاء';

  -- ٢) البلاستك للبارد
  insert into materials (business_id, name, base_unit, low_threshold, current_cost)
  select v_biz, 'كوب بلاستك', 'pcs', 50, 250
  where not exists (select 1 from materials
                     where business_id = v_biz and name = 'كوب بلاستك');
  insert into materials (business_id, name, base_unit, low_threshold, current_cost)
  select v_biz, 'غطاء بلاستك', 'pcs', 50, 100
  where not exists (select 1 from materials
                     where business_id = v_biz and name = 'غطاء بلاستك');

  select id into v_cup_p from materials where business_id = v_biz and name = 'كوب بلاستك';
  select id into v_lid_p from materials where business_id = v_biz and name = 'غطاء بلاستك';

  -- ٣) وصفات البارد تنتقل إلى البلاستك — عبر set_recipe لتبقى نسخةٌ وأثر
  for v_prod in
    select p.id
    from products p
    join recipes r on r.product_id = p.id and r.active
    where p.business_id = v_biz and p.category = 'cold' and p.active
      and exists (select 1 from recipe_items ri
                   join materials m on m.id = ri.material_id
                  where ri.recipe_id = r.id and m.name in ('كوب ورقي', 'غطاء ورقي'))
  loop
    select coalesce(jsonb_agg(x), '[]'::jsonb) into v_items
    from (
      -- كل ما ليس كوباً ولا غطاءً يبقى كما هو
      select jsonb_build_object('material_id', ri.material_id, 'qty', ri.qty,
                                'only_takeaway', ri.only_takeaway) as x
      from recipe_items ri
      join recipes r on r.id = ri.recipe_id
      join materials m on m.id = ri.material_id
      where r.product_id = v_prod.id and r.active
        and m.name not in ('كوب ورقي', 'غطاء ورقي')
      union all
      select jsonb_build_object('material_id', v_cup_p, 'qty', 1, 'only_takeaway', true)
      union all
      select jsonb_build_object('material_id', v_lid_p, 'qty', 1, 'only_takeaway', true)
    ) q;

    perform set_recipe(v_biz, v_prod.id, v_own,
                       (select coffee_grams from recipes
                         where product_id = v_prod.id and active),
                       v_items);
  end loop;
end
$mig$;
