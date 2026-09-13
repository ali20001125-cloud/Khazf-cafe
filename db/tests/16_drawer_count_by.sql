-- =====================================================================
-- من يعدّ الدرج؟
--
-- سأل المالك: لماذا نحمّل الباريستا العدّ؟ والعدّ لا يُعرّفه شيئاً — يكتب ما
-- بيده ولا يرى المتوقّع. لكن السؤال الأصحّ **من يعدّ**: العدّ هو لحظة
-- انتقال المسؤولية. فإن لم يعدّ أحدٌ عند الإغلاق ثم ظهر نقصٌ صباحاً، لم
-- يُعرف متى وقع، ولا يُتّهم أحد ولا يُبرّأ أحد.
--
-- والمفتاح هنا تمييزٌ صغير عظيم الأثر: **فارغ ≠ صفر**. وردية لم تُعدّ
-- معدودُها فارغ، لا صفر ولا «طابق». الخلط بينهما يصنع طمأنينة كاذبة.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches   limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner'   limit 1 \gset
select id as latte  from products where name='لاتيه' limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset

select record_purchase(:'biz',:'branch',:'own',id,
  case base_unit when 'g' then 5000 when 'ml' then 12000 else 300 end,
  case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,'رصيد')
from materials where business_id=:'biz' and active;

create or replace function _sell(p_shift uuid, p_key text) returns jsonb
language sql as $$
  select checkout(
    (select id from businesses limit 1), (select id from branches limit 1),
    (select id from users where role='barista' limit 1), p_shift,
    'takeaway','cash',5000,p_key,
    jsonb_build_array(jsonb_build_object(
      'product_id',(select id from products where name='لاتيه' limit 1),
      'crop_material_id',(select id from materials where name='حبوب الدورادو' limit 1),
      'qty',1)),
    null,null);
$$;

\echo '=== ١. «المالك يعدّ»: الباريستا يُنهي ورديته بلا رقم ==='
update branches set drawer_count_by = 'owner' where id = :'branch';
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as s1 \gset
select _sell(:'s1','dc-1')->>'order_number' as "فاتورة";
select close_shift_uncounted(:'s1', :'bar');

select status, counted_cash as "المعدود", expected_cash as "المتوقّع", variance as "الفرق"
from shifts where id = :'s1';

\echo ''
\echo '=== ٢. تظهر في «بانتظار عدّ المالك» ==='
select employee_name as "الموظف", business_day as "اليوم"
from v_shifts_awaiting_count where id = :'s1';

\echo ''
\echo '=== ٣. المالك يعدّ لاحقاً ==='
select count_closed_shift(:'s1', :'own', 53500) as "النتيجة";
select counted_cash as "المعدود", expected_cash as "المتوقّع", variance as "الفرق"
from shifts where id = :'s1';
select count(*)::int as "بقيت بانتظار العدّ" from v_shifts_awaiting_count where id = :'s1';

\echo ''
\echo '=== ٤. عدّ مرّتين مرفوض ==='
do $$ begin
  perform count_closed_shift((select id from shifts order by opened_at desc limit 1),
                             (select id from users where role='owner' limit 1), 9999);
  raise notice '✗ قُبل عدّ ثانٍ لوردية معدودة';
exception when others then
  raise notice '✓ رُفض العدّ الثاني: %', left(sqlerrm, 60);
end $$;

\echo ''
\echo '=== ٥. «الباريستا يعدّ»: الإغلاق بلا رقم مرفوض ==='
update branches set drawer_count_by = 'barista' where id = :'branch';
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as s2 \gset
select _sell(:'s2','dc-2')->>'order_number' as "فاتورة";
do $$ begin
  perform close_shift_uncounted((select id from shifts where status='OPEN' limit 1),
                                (select id from users where role='barista' limit 1));
  raise notice '✗ أُغلقت بلا عدّ رغم أن الفرع يطلب عدّ الباريستا';
exception when others then
  raise notice '✓ رُفض: %', left(sqlerrm, 70);
end $$;
select close_shift_blind(:'s2', :'bar', 53500);
select counted_cash as "المعدود", variance as "الفرق" from shifts where id = :'s2';

\echo ''
\echo '=== ٦. «لا أحد»: تُغلق ولا تنتظر عدّاً ==='
update branches set drawer_count_by = 'none' where id = :'branch';
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as s3 \gset
select _sell(:'s3','dc-3')->>'order_number' as "فاتورة";
select close_shift_uncounted(:'s3', :'bar');
select (select count(*)::int from v_shifts_awaiting_count where id = :'s3') as "بانتظار العدّ",
       (select counted_cash is null from shifts where id = :'s3') as "المعدود فارغ";

\echo ''
\echo '=== ٧. الوردية غير المعدودة لا تُحسب فرقاً كاذباً ==='
update branches set drawer_count_by = 'owner' where id = :'branch';
select kind as "نوع التنبيه", detail->>'variance' as "الفرق"
from v_exceptions where kind = 'cash_variance' order by at;

\echo ''
\echo '=== الخلاصة ==='
select case when (select variance from shifts where id = :'s1') = 53500 - (select expected_cash from shifts where id = :'s1')
       then '✓ عدّ المالك يُنتج الفرق نفسه الذي كان سينتجه عدّ الباريستا'
       else '✗ حساب الفرق مختلف' end as result
union all
select case when (select counted_cash is null from shifts where id = :'s3')
       then '✓ «لم يُعدّ» يبقى فارغاً — لا صفراً يُقرأ «طابق»'
       else '✗ فُسّر غياب العدّ رقماً' end
union all
select case when (select count(*)::int from v_exceptions
                   where kind='cash_variance' and (detail->>'variance')::int = 0) = 0
       then '✓ لا تنبيه فرقٍ كاذب على وردية لم تُعدّ'
       else '✗ ظهر فرق كاذب' end
union all
select case when (select count(*)::int from v_shifts_awaiting_count) = 0
       then '✓ ما عُدّ خرج من قائمة الانتظار'
       else '✗ بقي في الانتظار بعد العدّ' end
union all
-- الفرع صار «المالك يعدّ» في الخطوة ٧، ووردية `s3` أُغلقت تحت «لا أحد».
-- لو قُرئت السياسة من الفرع لظهرت فجأةً بانتظار عدٍّ لا معنى له بعد أيام.
select case when (select count_mode from shifts where id = :'s3') = 'none'
        and (select count(*)::int from v_shifts_awaiting_count where id = :'s3') = 0
       then '✓ تغيير الإعداد لا يُحيي ورديات أُغلقت تحت سياسة أخرى'
       else '✗ سياسة اليوم طُبّقت بأثر رجعي' end;

drop function _sell(uuid, text);
