-- =====================================================================
-- ورقة العدّ: المتوقّع ومعه سنده
--
-- «اليوم بعنا من هذا المحصول كذا أكواب تساوي كذا كمية، إذن المتوقّع كذا».
-- رقمٌ بلا سند لا يُراجَع — ومَن لا يعرف من أين جاء لا يكتشف أنه غلط.
--
-- ويُثبت أيضاً أن السند يُصفَّر عند كل عدّة: ما قبلها انتهى حسابه.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner' limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset
select id as prod   from products where name='أمريكانو' limit 1 \gset

select record_purchase(:'biz',:'branch',:'own',:'crop',6000,25,'شراء') as "اشترى";
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

\echo '=== ١. عشرون كوباً × ١٨ غ = ٣٦٠ غ، وهدر ٤٠ ==='
select checkout(:'biz',:'branch',:'bar',:'shift','dine_in','cash',200000,'cs-1',
  jsonb_build_array(jsonb_build_object('product_id',:'prod','crop_material_id',:'crop','qty',20)),
  null,null) ->> 'order_number' as "فاتورة" \gset
select record_waste(:'biz',:'branch',:'bar',:'crop',40,'dial_in') as "بعد الهدر";

select cups as "أكواب", sold as "بيعاً", wasted as "هدراً",
       purchased as "شراءً", expected as "المتوقّع"
from count_sheet(:'branch') where material_id = :'crop';

select case when cups = 20 and sold = 360 and wasted = 40
                 and purchased = 6000 and expected = 5600
            then '✓ السند يطابق الحساب: ٦٠٠٠ − ٣٦٠ − ٤٠ = ٥٬٦٠٠'
            else '❌ السند لا يطابق' end as "النتيجة"
from count_sheet(:'branch') where material_id = :'crop';

\echo ''
\echo '=== ٢. العدّة تصفّر السند — ما قبلها انتهى حسابه ==='
select apply_stock_count(:'biz',:'branch',:'own',
  jsonb_build_array(jsonb_build_object('material_id',:'crop','counted',5600))) -> 'items' -> 0 ->> 'variance'
  as "فرق العدّة";

select case when cups = 0 and sold = 0 and wasted = 0 and purchased = 0
            then '✓ السند صفر بعد العدّة'
            else format('❌ بقي سند: أكواب=%s بيع=%s هدر=%s شراء=%s', cups, sold, wasted, purchased)
       end as "النتيجة"
from count_sheet(:'branch') where material_id = :'crop';

\echo ''
\echo '=== ٣. بيعٌ بعد العدّة يظهر وحده ==='
select checkout(:'biz',:'branch',:'bar',:'shift','dine_in','cash',50000,'cs-2',
  jsonb_build_array(jsonb_build_object('product_id',:'prod','crop_material_id',:'crop','qty',5)),
  null,null) ->> 'order_number' as o2 \gset

select cups as "أكواب", sold as "بيعاً", expected as "المتوقّع"
from count_sheet(:'branch') where material_id = :'crop';

select case when cups = 5 and sold = 90 and expected = 5510
            then '✓ خمسة أكواب فقط — ما قبل العدّة لم يُحسب مرّتين'
            else '❌ السند يحسب ما قبل العدّة' end as "النتيجة"
from count_sheet(:'branch') where material_id = :'crop';

\echo ''
\echo '=== ٤. الفاتورة الملغاة لا تدخل السند ==='
update orders set status = 'VOIDED' where order_number = :o2;
select case when cups = 0 then '✓ الملغاة خرجت من عدّ الأكواب'
            else format('❌ ما زالت تُحسب: %s كوباً', cups) end as "النتيجة"
from count_sheet(:'branch') where material_id = :'crop';
