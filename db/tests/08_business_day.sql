-- =====================================================================
-- اليوم المحاسبي (0017): بيع الساعة ١ فجراً ينتمي لليوم السابق
--
-- السؤال الذي يجيب عنه هذا الاختبار: المقهى يغلق الوردية الساعة ١ فجراً.
-- هل تُحسب مبيعات تلك الساعة على أمس أم على اليوم؟
-- الجواب المطلوب: **على أمس** — لأن الوردية بدأت أمس ولم تنتهِ بعد.
-- =====================================================================
\pset pager off
\set QUIET on

select id as branch from branches limit 1 \gset

\echo '=== الإعداد: اليوم يبدأ الساعة ٥ صباحاً ==='
select name, timezone, day_start_hour from branches where id = :'branch';

\echo ''
\echo '=== نفس اللحظة، حسابان مختلفان ==='
with samples(label, ts) as (values
  ('٧ سبتمبر ٠١:٠٠ فجراً (وردية أمس ما زالت مفتوحة)', timestamptz '2026-09-07 01:00 +03'),
  ('٧ سبتمبر ٠٤:٥٩ (قبل بداية اليوم بدقيقة)',          timestamptz '2026-09-07 04:59 +03'),
  ('٧ سبتمبر ٠٥:٠٠ (بداية اليوم الجديد)',              timestamptz '2026-09-07 05:00 +03'),
  ('٧ سبتمبر ١٤:٠٠ ظهراً',                             timestamptz '2026-09-07 14:00 +03'),
  ('٧ سبتمبر ٢٣:٥٩ ليلاً',                             timestamptz '2026-09-07 23:59 +03')
)
select s.label,
       (s.ts at time zone 'Asia/Baghdad')::date as "بمنتصف الليل (الخطأ)",
       business_day(s.ts, :'branch')            as "اليوم المحاسبي (الصحيح)"
from samples s;

\echo ''
\echo '=== حدود اليوم المحاسبي ٦ سبتمبر ==='
select business_day_start(:'branch', date '2026-09-06') as "يبدأ",
       business_day_end(:'branch', date '2026-09-06')   as "ينتهي";

\echo ''
\echo '=== التحقّق: كل لحظة بين الحدّين تنتمي لذلك اليوم ==='
select business_day(business_day_start(:'branch', date '2026-09-06'), :'branch') = date '2026-09-06'
         as "بداية اليوم صحيحة",
       business_day(business_day_end(:'branch', date '2026-09-06') - interval '1 second', :'branch') = date '2026-09-06'
         as "آخر ثانية صحيحة",
       business_day(business_day_end(:'branch', date '2026-09-06'), :'branch') = date '2026-09-07'
         as "الحدّ التالي يوم جديد";

\echo ''
\echo '=== لو غيّر المالك ساعة البداية إلى منتصف الليل ==='
update branches set day_start_hour = 0 where id = :'branch';
select business_day(timestamptz '2026-09-07 01:00 +03', :'branch') as "الساعة ١ فجراً تصير";
update branches set day_start_hour = 5 where id = :'branch';
select business_day(timestamptz '2026-09-07 01:00 +03', :'branch') as "وبالرجوع للخامسة";
