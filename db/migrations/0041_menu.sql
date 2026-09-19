-- =====================================================================
-- 0041 · المنيو الإلكتروني
--
-- قال المالك: «منيو إلكتروني يفتح بالباركود للمشروبات للزبائن · مراح
-- أطبع ورقياً لأنه يحتاج تصميماً وحدّاً أدنى · الإلكتروني أسهل: صور
-- المشروب تُضاف والسعر والمكوّنات · ابدأ بأي شيء، أنا ما عندي أي صور
-- حالياً، فممكن تُضاف لاحقاً — أمّا الآن يُبنى الأساس».
--
-- فالأساس ثلاثة حقول، لا جدولٌ جديد: المنيو **هو** كتالوج البيع نفسه.
-- جدولٌ منفصل يعني اسمين وسعرين لشيءٍ واحد، فيتغيّر السعر في الكاشير
-- ويبقى القديم معروضاً للزبون — وهذا أسوأ من ألّا يكون ثمّة منيو.
--
--   • `menu_visible`: ليس كل ما يُباع يُعرض. مشروبٌ للتجربة أو صنفٌ
--     للموظّفين يبقى في الكاشير ويغيب عن المنيو.
--   • `menu_note`: سطرٌ بكلام المالك تحت الاسم. المكوّنات كما يريد أن
--     يقولها هو — «إسبريسو مزدوج وحليب مبخّر» — لا وصفةٌ تُفشي غراماته.
--   • `image_url`: فارغٌ اليوم، والمنيو يعمل بلا صورة. يُملأ حين تُصوَّر
--     المشروبات، فلا هجرةَ ثانية حينها.
--
-- و«غير متوفّر» في المنيو مربوطٌ بـ`paused` وحده — راية المالك — لا
-- بالمخزون. لأن المخزون يتحرّك كل دقيقة، ومنيو تختفي منه الأصناف
-- وتعود بينما الزبون يقرأ ليس منيو. ما نفد يقوله الباريستا عند
-- الكاونتر، وهو يراه في شاشته.
-- =====================================================================

alter table products
  add column if not exists menu_visible boolean not null default true,
  add column if not exists menu_note    text,
  add column if not exists image_url    text;

comment on column products.menu_visible is
  'يظهر في منيو الزبائن. ما يُباع في الكاشير ولا يُعرض عليهم يُطفأ من هنا.';
comment on column products.menu_note is
  'سطرٌ قصير تحت الاسم في المنيو، بكلام المالك: «إسبريسو مزدوج وحليب مبخّر».';
comment on column products.image_url is
  'صورة المشروب في المنيو. فارغةٌ الآن — المنيو يعمل بلا صور، وتُضاف حين تُصوَّر.';

-- ── منيو الزبون ─────────────────────────────────────────────────────
-- ما يُرجَع هنا يراه من لا حساب له، فكل عمودٍ زائد تسريب: لا تكلفة ولا
-- رصيد ولا معرّف مادة. الاسم والسعر والأنواع وحدها.
create or replace function public_menu(p_business uuid)
returns table(
  product_id uuid, name text, category text, note text, image_url text,
  paused boolean, kind text, sort integer,
  min_price integer, max_price integer, variants text[]
)
language sql stable as $$
  select p.id, p.name, p.category, p.menu_note, p.image_url,
         p.paused, p.kind, p.sort,
         min(pc.price)::int as min_price,
         max(pc.price)::int as max_price,
         -- أنواع البنّ ميزةٌ تُعرض في مقهى مختصّ، لا تفصيلٌ داخلي
         array_agg(m.name order by m.name) as variants
  from products p
  join product_crops pc on pc.product_id = p.id and pc.available
  join materials m on m.id = pc.material_id
  where p.business_id = p_business and p.active and p.menu_visible
  group by p.id, p.name, p.category, p.menu_note, p.image_url,
           p.paused, p.kind, p.sort
  order by p.kind, p.sort, p.name;
$$;

comment on function public_menu(uuid) is
  'منيو الزبون: الاسم والسعر والأنواع فقط. لا تكلفة ولا رصيد ولا معرّف مادة — يفتحه من لا حساب له.';
