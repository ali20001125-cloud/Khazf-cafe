-- المنيو بالإنجليزية إلى جانب العربية.
--
-- **الترجمة تُكتب ولا تُولَّد.** «AI Language Translation» في الخدمات
-- المدفوعة تترجم «فلات وايت» إلى «Flat White» — وهذا صحيح — ثم تترجم
-- «تقطير» إلى «Distillation»، وهي عمليّة كيميائية لا مشروب. أسماء
-- القهوة اصطلاحٌ لا لغة، ومن يعرفها يكتبها في دقيقة، ومن لا يعرفها
-- تُخطئ عنه في صمت.
--
-- ولذلك حقلان يملؤهما المالك. **والفارغ يعني: اعرض العربي.** فمنيو
-- نصفه مترجمٌ أفضل من منيو نصفه خطأ، ولا يُجبَر أحد على ملء كل صنفٍ
-- قبل أن يرى الفائدة.

alter table products
  add column if not exists name_en text,
  add column if not exists menu_note_en text;

comment on column products.name_en is
  'اسم المشروب بالإنجليزية. فارغ = اعرض العربي كما هو.';
comment on column products.menu_note_en is
  'السطر تحت الاسم بالإنجليزية. فارغ = اعرض العربي.';

-- والاسم الإنجليزي يُعرض كما هو للمحصول أيضاً — «حبوب قهوة مختصّة»
-- تُقرأ على الأجنبي حروفاً لا معنى.
alter table materials
  add column if not exists menu_label_en text;

comment on column materials.menu_label_en is
  'اسم المادّة في المنيو بالإنجليزية. فارغ = اعرض العربي.';

-- بذرةٌ لما هو اصطلاحٌ عالميّ لا يحتاج اجتهاداً. وما سواه يتركه
-- المالك أو يكتبه بنفسه — ولا يُخمَّن له اسم.
update products set name_en = 'Espresso'        where name = 'إسبريسو'      and name_en is null;
update products set name_en = 'Double Espresso' where name = 'دبل إسبريسو'  and name_en is null;
update products set name_en = 'Americano'       where name = 'أمريكانو'     and name_en is null;
update products set name_en = 'Iced Americano'  where name = 'آيس أمريكانو' and name_en is null;
update products set name_en = 'Latte'           where name = 'لاتيه'        and name_en is null;
update products set name_en = 'Iced Latte'      where name = 'آيس لاتيه'    and name_en is null;
update products set name_en = 'Cappuccino'      where name = 'كابتشينو'     and name_en is null;
update products set name_en = 'Flat White'      where name = 'فلات وايت'    and name_en is null;
update products set name_en = 'Mocha'           where name = 'موكا'         and name_en is null;
update products set name_en = 'V60'             where name = 'في٦٠'         and name_en is null;
update products set name_en = 'Pour Over'       where name = 'تقطير'        and name_en is null;

update materials set menu_label_en = 'Specialty Coffee Beans'
 where menu_label = 'حبوب قهوة مختصّة' and menu_label_en is null;

-- ونسخةٌ إنجليزية من دالّة المنيو: الصفوف نفسها بالأسماء الأخرى.
-- و`coalesce` في كل موضع، فالمنيو لا يُظهر فراغاً أبداً.
create or replace function public.public_menu_en(p_business uuid)
returns table(product_id uuid, name text, category text, note text,
              image_url text, paused boolean, kind text, sort integer,
              special boolean, min_price integer, max_price integer,
              variants text[])
language sql
stable
as $function$
  select p.id,
         coalesce(nullif(btrim(p.name_en), ''), p.name),
         p.category,
         coalesce(nullif(btrim(p.menu_note_en), ''), p.menu_note),
         p.image_url, p.paused, p.kind, p.sort, p.is_daily_special,
         min(pc.price)::int as min_price,
         max(pc.price)::int as max_price,
         array_agg(distinct case
           when p.kind = 'drink' then
             coalesce(nullif(btrim(m.menu_label_en), ''), m.menu_label, 'Specialty Coffee Beans')
           else coalesce(nullif(btrim(m.menu_label_en), ''), m.menu_label, m.name)
         end) as variants
  from products p
  join product_crops pc on pc.product_id = p.id and pc.available
  join materials m on m.id = pc.material_id
  where p.business_id = p_business and p.active and p.menu_visible
    and menu_hour_ok(
          p.menu_from, p.menu_to,
          extract(hour from (now() at time zone 'Asia/Baghdad'))::int
        )
  group by p.id, p.name, p.name_en, p.category, p.menu_note, p.menu_note_en,
           p.image_url, p.paused, p.kind, p.sort, p.is_daily_special
  order by p.kind, p.sort, p.name;
$function$;

-- والمكوّنات أيضاً: كانت الورقة الإنجليزية تُظهر «حليب» و«حبوب قهوة
-- مختصّة» وسط نصٍّ إنجليزي. (ظهر في الاختبار بعد أن بدت الصفحة سليمة.)
update materials set menu_label_en = 'Milk'            where name = 'حليب'          and menu_label_en is null;
update materials set menu_label_en = 'Oat milk'        where name = 'حليب شوفان'    and menu_label_en is null;
update materials set menu_label_en = 'Vanilla syrup'   where name = 'سيروب فانيلا'  and menu_label_en is null;
update materials set menu_label_en = 'Caramel syrup'   where name = 'سيروب كاراميل' and menu_label_en is null;

create or replace function public.product_detail_en(p_product uuid, p_crop uuid)
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
    select coalesce(nullif(btrim(m.menu_label_en), ''), 'Specialty Coffee Beans') as name,
           m.menu_note, r.coffee_grams::numeric as qty, m.base_unit,
           r.coffee_grams * m.kcal_per_unit        as kcal,
           r.coffee_grams * m.caffeine_mg_per_unit as caffeine
    from r join materials m on m.id = p_crop
    where r.coffee_grams > 0
  ),
  rest as (
    -- الاحتياط هنا الاسم العربي لا الصمت: مكوّنٌ بلا ترجمة يُذكر
    -- باسمه أفضل من أن يختفي من قائمةٍ يقرؤها من يسأل عن الحساسية.
    select coalesce(nullif(btrim(m.menu_label_en), ''), m.menu_label, m.name) as name,
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
