-- مشروبٌ يظهر في ساعته ويختفي بعدها.
--
-- الفطور لا يُطلب في العاشرة مساءً، والمشروب الذي يحتاج تحضيراً طويلاً
-- لا يُطلب في الزحام. وهذا اليوم يُدار بالذاكرة: يُطفئه المالك صباحاً
-- إن تذكّر، ويبقى ظاهراً إن نسي — فيطلبه زبونٌ ويُقال له «انتهى».
--
-- ساعتان لا جدولٌ بأيّام الأسبوع: المقهى يفتح كل يوم، والذي يتغيّر هو
-- ساعة اليوم لا يومه. وجدولٌ أوسع يعني شاشةً أعقد لا يفتحها أحد.
--
-- **الفراغ يعني: طوال الوقت.** وهي الحالة الغالبة، فلا يُجبَر المالك
-- على ملء حقلٍ لكل مشروب.

alter table products
  add column if not exists menu_from smallint,
  add column if not exists menu_to   smallint;

comment on column products.menu_from is
  'ساعة بدء الظهور في المنيو (٠-٢٣). فارغة = من بداية اليوم.';
comment on column products.menu_to is
  'ساعة آخر ظهور، شاملةً إيّاها (٠-٢٣). فارغة = إلى آخر اليوم.';

-- ساعةٌ خارج اليوم تُرَدّ عند الكتابة لا تُكتشف حين يختفي مشروبٌ بلا سبب
alter table products
  drop constraint if exists products_menu_hours_range;
alter table products
  add constraint products_menu_hours_range check (
    (menu_from is null or (menu_from >= 0 and menu_from <= 23)) and
    (menu_to   is null or (menu_to   >= 0 and menu_to   <= 23))
  );

/*
 * والمقارنة تحتمل نافذةً تعبر منتصف الليل: «٢٢ ← ٢» مقهىً يسهر.
 * فحين تكون البداية بعد النهاية، الشرط «أو» لا «و».
 *
 * والساعة بتوقيت بغداد: الخادم في أوروبا، و`now()` عنده ليست ساعة
 * المحلّ. ثلاث ساعاتٍ فرقاً تعني أن مشروب الصباح يظهر قبل الفجر.
 */
create or replace function public.menu_hour_ok(
  p_from smallint, p_to smallint, p_hour int
) returns boolean
language sql
immutable
as $function$
  select case
    when p_from is null and p_to is null then true
    when p_from is null then p_hour <= p_to
    when p_to   is null then p_hour >= p_from
    when p_from <= p_to then p_hour >= p_from and p_hour <= p_to
    else p_hour >= p_from or p_hour <= p_to   -- نافذةٌ تعبر منتصف الليل
  end;
$function$;

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
         array_agg(distinct case
           when p.kind = 'drink' then coalesce(m.menu_label, 'حبوب قهوة مختصّة')
           else coalesce(m.menu_label, m.name)
         end) as variants
  from products p
  join product_crops pc on pc.product_id = p.id and pc.available
  join materials m on m.id = pc.material_id
  where p.business_id = p_business and p.active and p.menu_visible
    and menu_hour_ok(
          p.menu_from, p.menu_to,
          extract(hour from (now() at time zone 'Asia/Baghdad'))::int
        )
  group by p.id, p.name, p.category, p.menu_note, p.image_url,
           p.paused, p.kind, p.sort, p.is_daily_special
  order by p.kind, p.sort, p.name;
$function$;
