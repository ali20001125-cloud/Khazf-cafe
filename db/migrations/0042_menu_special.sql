-- =====================================================================
-- 0042 · المميّز في المنيو
--
-- قال المالك: «عندنا مشروبات غالية ومميّزة، وهذي سعرها عالي وأكيد غير
-- متوفّرة كل يوم».
--
-- فالمنيو الذي يعرض الغالي كأيّ صفٍّ في قائمة يُضيّعه: من يمسح المنيو
-- بعينه في عشر ثوانٍ لا يتوقّف عند سطرٍ لا شيء فيه يوقفه. والمشروب
-- الذي يُعدّ بيدٍ ويُباع بضعف الثمن هو أوّل ما يجب أن يُرى.
--
-- و`is_daily_special` قائمةٌ في الجدول منذ الأصل ولا قارئ لها. فبدل
-- عمودٍ جديد يقول الشيء نفسه، تُفتح هذه للمنيو: المميّز يأخذ بطاقةً
-- بعرض الشاشة فوق صفّه.
--
-- أمّا **متى يُقال «غير متوفّر»** فبابٌ آخر أجّله المالك للنقاش، ولم
-- يُبَتّ فيه هنا.
-- =====================================================================

-- تغيّر شكل المُخرَج، و`create or replace` لا يغيّر نوع الإرجاع
drop function if exists public_menu(uuid);

create function public_menu(p_business uuid)
returns table(
  product_id uuid, name text, category text, note text, image_url text,
  paused boolean, kind text, sort integer, special boolean,
  min_price integer, max_price integer, variants text[]
)
language sql stable as $$
  select p.id, p.name, p.category, p.menu_note, p.image_url,
         p.paused, p.kind, p.sort, p.is_daily_special,
         min(pc.price)::int as min_price,
         max(pc.price)::int as max_price,
         array_agg(m.name order by m.name) as variants
  from products p
  join product_crops pc on pc.product_id = p.id and pc.available
  join materials m on m.id = pc.material_id
  where p.business_id = p_business and p.active and p.menu_visible
  group by p.id, p.name, p.category, p.menu_note, p.image_url,
           p.paused, p.kind, p.sort, p.is_daily_special
  order by p.kind, p.sort, p.name;
$$;

comment on function public_menu(uuid) is
  'منيو الزبون: الاسم والسعر والأنواع فقط. لا تكلفة ولا رصيد ولا معرّف مادة — يفتحه من لا حساب له. و«المميّز» يأخذ بطاقةً بعرض الشاشة.';
