-- =====================================================================
-- السيناريو الحقيقي: وردية تُغلق الساعة ١ فجراً
--
-- «مرات الوردية قد تغلق في الساعة ١ فجراً اليوم الثاني — فشلون؟»
-- الجواب المطلوب: كل مبيعات تلك الوردية تُحسب على **اليوم الذي بدأت فيه**،
-- لا أن ينقسم اليوم نصفين فيظهر يوم ناقص ويوم منتفخ.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar from users where role='barista' limit 1 \gset
select id as own from users where role='owner' limit 1 \gset

\echo '=== الإعداد: اليوم يبدأ الساعة ٥ صباحاً ==='
update branches set day_start_hour = 5 where id = :'branch';
select day_start_hour from branches where id = :'branch';

\echo ''
\echo '=== فواتير موزّعة على ليلة واحدة ==='
-- نُدرج الطلبات بأوقات صريحة (المُشغّلات تسمح: اليوم غير مُغلق)
create temp table _sim(label text, ts timestamptz, amount int);
insert into _sim values
  ('٢٠:٠٠ مساء ٦ سبتمبر',  timestamptz '2026-09-06 20:00 +03', 5000),
  ('٢٣:٣٠ ليل ٦ سبتمبر',   timestamptz '2026-09-06 23:30 +03', 7000),
  ('٠٠:٤٥ فجر ٧ سبتمبر',   timestamptz '2026-09-07 00:45 +03', 6000),
  ('٠١:٠٠ فجر ٧ سبتمبر (إغلاق الوردية)', timestamptz '2026-09-07 01:00 +03', 4000),
  ('٠٩:٠٠ صباح ٧ سبتمبر (يوم جديد)',      timestamptz '2026-09-07 09:00 +03', 9000);

select s.label,
       (s.ts at time zone 'Asia/Baghdad')::date as "لو حسبناه بمنتصف الليل",
       business_day(s.ts, :'branch')            as "اليوم المحاسبي الصحيح",
       s.amount as "المبلغ"
from _sim s order by s.ts;

\echo ''
\echo '=== المجموع على كل تعريف ==='
select business_day(s.ts, :'branch') as "اليوم المحاسبي",
       count(*) as "فواتير",
       sum(s.amount) as "المجموع"
from _sim s
group by business_day(s.ts, :'branch')
order by 1;

\echo ''
\echo 'وبمنتصف الليل (الخطأ) لكان اليومان:'
select (s.ts at time zone 'Asia/Baghdad')::date as "اليوم",
       count(*) as "فواتير",
       sum(s.amount) as "المجموع"
from _sim s
group by (s.ts at time zone 'Asia/Baghdad')::date
order by 1;

\echo ''
\echo '=== الخلاصة ==='
select case
  when (select count(*) from _sim s where business_day(s.ts, :'branch') = date '2026-09-06') = 4
   and (select sum(amount) from _sim s where business_day(s.ts, :'branch') = date '2026-09-06') = 22000
  then '✓ الأربع فواتير حتى الفجر كلها على ٦ سبتمبر بمجموع 22000 — الوردية لم تنقسم'
  else '✗ الوردية انقسمت بين يومين'
end as result;
drop table _sim;
