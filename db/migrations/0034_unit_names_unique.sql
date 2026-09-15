-- =====================================================================
-- 0034 · وحدة شراء واحدة لكل اسم
--
-- كُشف هذا بالنظر إلى الشاشة لا بقراءة الكود: صفحة المخزون عرضت «علبة ١
-- لتر» عشر مرّات تحت الحليب. فالجدول كان يقبل الاسم مكرّراً.
--
-- وأثره ليس تشويشاً بصرياً فقط: الوحدة الافتراضية تُختار لقائمة الشراء،
-- ووحدتان بنفس الاسم تجعلان «كم كرتوناً أشتري؟» سؤالاً بجوابين.
-- =====================================================================

-- إزالة المكرّر قبل الفهرس: يُبقى الأقدم (هو المُشار إليه في الحركات إن
-- وُجدت)، ويُنقل إليه ما أشار لغيره ثم تُحذف البقية.
with ranked as (
  select id, material_id, name,
         first_value(id) over (partition by material_id, name order by created_at, id) as keep_id
  from material_units
)
update inventory_transactions t
   set unit_id = r.keep_id
  from ranked r
 where t.unit_id = r.id and r.id <> r.keep_id;

with ranked as (
  select id, material_id, name,
         first_value(id) over (partition by material_id, name order by created_at, id) as keep_id
  from material_units
)
delete from material_units u using ranked r
 where u.id = r.id and r.id <> r.keep_id;

create unique index if not exists uq_material_unit_name
  on material_units(material_id, name);

comment on index uq_material_unit_name is
  'اسم الوحدة مفتاحها عند المالك: «كرتون» مرّتين تجعل قائمة الشراء تقترح رقمين.';
