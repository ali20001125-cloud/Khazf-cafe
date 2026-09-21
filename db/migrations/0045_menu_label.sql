-- اسمُ المادّة عند الزبون ≠ اسمها عندك.
--
-- قال المالك: «المنيو ما أريد يطلع حبوب الدورادو أو كالدي، بل حبوب قهوة
-- مختصّة — النوع هذا شغل الباك اند».
--
-- وهو محقّ: المحصول قرارٌ يومي يُتّخذ في الخلف. وكتابته على الطاولة
-- تُحوّله وعداً: زبونٌ قرأ «كالدي» وجاء غداً يطلبه، فإمّا أن تلزمك
-- الحبّة التي نفدت، وإمّا أن تُخلف. والمقهى المختصّ يذكر المحصول حين
-- يقصد أن يذكره — لا لأن اسم المادّة في المخزن تسرّب إلى الشاشة.
--
-- ولذلك حقلٌ مستقلّ لا إعادة تسمية: «حبوب كالدي» يبقى في المخزون
-- والتكاليف والجرد — لأنك تشتريه وتعدّه بهذا الاسم. و`menu_label` هو
-- ما يُقرأ على الطاولة وحده.

alter table materials
  add column if not exists menu_label text;

comment on column materials.menu_label is
  'الاسم المعروض في منيو الزبون. فارغٌ يعني: اعرض الاسم نفسه.';

-- **بنّ المشروبات وحده.** والبضاعة تمرّ بـ`product_crops` هي أيضاً:
-- كيسُ بنٍّ يُباع، وكوبُ سيراميك. فشرطُ «كل ما يُشار إليه من
-- `product_crops`» يُسمّي الكوب «حبوب قهوة مختصّة» — ولذلك الشرط على
-- المشروبات وحدها. (وقع هذا فعلاً في الاختبار قبل أن يُصحَّح.)
--
-- والحليب حليبٌ عند الطرفين، فلا داعي لأن يُسمّى مرّتين.
update materials m
   set menu_label = 'حبوب قهوة مختصّة'
 where m.menu_label is null
   and exists (
     select 1 from product_crops pc
     join products p on p.id = pc.product_id
     where pc.material_id = m.id and p.kind = 'drink'
   );

-- والبضاعة تُسمّى باسمها منقوصاً لاحقتَه: «بن كالدي — للبيع» صار
-- «بن كالدي». فاللاحقة عندك لتفصل مخزون البيع عن مخزون المحلّ — وهي
-- كلامٌ داخليّ لا معنى له عند من يشتري الكيس. وهنا يُذكر المحصول
-- عمداً: الزبون يشتري هذا الكيس بعينه، لا كوباً نختار حبّته.
update materials m
   set menu_label = regexp_replace(m.name, '\s*—\s*للبيع\s*$', '')
 where m.menu_label is null
   and m.name ~ '—\s*للبيع\s*$'
   and exists (
     select 1 from product_crops pc
     join products p on p.id = pc.product_id
     where pc.material_id = m.id and p.kind = 'retail'
   );

-- والمنيو يقرأ المعروض لا المخزون. و`distinct`: ثلاثة محاصيل صار
-- اسمها المعروض واحداً، فلولاه لظهر «حبوب قهوة مختصّة» ثلاث مرّات
-- تحت المشروب الواحد.
create or replace function public.public_menu(p_business uuid)
returns table(product_id uuid, name text, category text, note text,
              image_url text, paused boolean, kind text, sort integer,
              special boolean, min_price integer, max_price integer,
              variants text[])
language sql
stable
as $function$
  select p.id, p.name, p.category, p.menu_note, p.image_url,
         p.paused, p.kind, p.sort, p.is_daily_special,
         min(pc.price)::int as min_price,
         max(pc.price)::int as max_price,
         -- في المشروبات: الاحتياط هو الصمت — محصولٌ يُضاف غداً بلا
         -- تسمية سيُسرّب اسمه إلى الطاولة، والأأمن ألّا يُذكر.
         -- وفي البضاعة: الاسم نفسه، فكيس البنّ يُشترى باسمه.
         array_agg(distinct case
           when p.kind = 'drink' then coalesce(m.menu_label, 'حبوب قهوة مختصّة')
           else coalesce(m.menu_label, m.name)
         end) as variants
  from products p
  join product_crops pc on pc.product_id = p.id and pc.available
  join materials m on m.id = pc.material_id
  where p.business_id = p_business and p.active and p.menu_visible
  group by p.id, p.name, p.category, p.menu_note, p.image_url,
           p.paused, p.kind, p.sort, p.is_daily_special
  order by p.kind, p.sort, p.name;
$function$;

-- والتفاصيل تقرأ المعروض لا المخزون.
create or replace function public.product_detail(p_product uuid, p_crop uuid)
returns jsonb
language sql
stable
as $function$
  with r as (
    select id, coffee_grams from recipes
    where product_id = p_product and active
    order by version desc limit 1
  ),
  bean as (
    -- هذا الفرع لا يعمل إلّا لمشروبٍ له وصفة (`coffee_grams > 0`)،
    -- فالمادّة هنا بنٌّ يقيناً — والصمت هو الاحتياط.
    select coalesce(m.menu_label, 'حبوب قهوة مختصّة') as name,
           m.menu_note, r.coffee_grams::numeric as qty, m.base_unit,
           r.coffee_grams * m.kcal_per_unit        as kcal,
           r.coffee_grams * m.caffeine_mg_per_unit as caffeine
    from r join materials m on m.id = p_crop
    where r.coffee_grams > 0
  ),
  rest as (
    select coalesce(m.menu_label, m.name) as name,
           m.menu_note, ri.qty::numeric as qty, m.base_unit,
           ri.qty * m.kcal_per_unit        as kcal,
           ri.qty * m.caffeine_mg_per_unit as caffeine
    from r
    join recipe_items ri on ri.recipe_id = r.id and not ri.only_takeaway
    join materials m on m.id = ri.material_id
    where m.base_unit <> 'pcs'
  ),
  all_parts as (select * from bean union all select * from rest)
  select jsonb_build_object(
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'note', menu_note,
               'qty', round(qty)::int, 'unit', base_unit)
             order by base_unit, name)
      from all_parts), '[]'::jsonb),
    'kcal',     coalesce((select round(sum(kcal))::int     from all_parts), 0),
    'caffeine', coalesce((select round(sum(caffeine))::int from all_parts), 0),
    'known',    exists (select 1 from all_parts)
  );
$function$;
