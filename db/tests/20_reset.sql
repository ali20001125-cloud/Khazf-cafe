-- =====================================================================
-- تصفير بيانات التجربة
--
-- الخطر في هذه الدالّة ليس أنها لا تعمل، بل أنها تعمل **أكثر ممّا يُراد**:
-- تمسح بيعاً حقيقياً، أو تمسح الكتالوج فيقف المقهى، أو يشغّلها باريستا.
-- فالاختبار هنا يسأل ثلاثة أسئلة: هل مسحت ما يجب؟ وهل أبقت ما يجب؟ وهل
-- ترفض من لا يملك؟
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches   limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner'   limit 1 \gset

select record_purchase(:'biz',:'branch',:'own',id,
  case base_unit when 'g' then 5000 when 'ml' then 12000 else 300 end,
  case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,'رصيد')
from materials where business_id=:'biz' and active;

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as s1 \gset

select checkout(:'biz',:'branch',:'bar',:'s1','takeaway','cash',5000,'rst-1',
  jsonb_build_array(jsonb_build_object(
    'product_id',(select id from products where name='لاتيه' limit 1),
    'crop_material_id',(select id from materials where name='حبوب الدورادو' limit 1),
    'qty',1)), null, null)->>'order_number' as "فاتورة";

\echo '=== ١. قبل التصفير ==='
select (select count(*)::int from orders) as "طلبات",
       (select count(*)::int from payments) as "دفعات",
       (select count(*)::int from inventory_transactions) as "حركات مخزون",
       (select count(*)::int from shifts) as "ورديات",
       (select cached_stock from materials where name='حبوب الدورادو') as "رصيد الدورادو";

select count(*)::int as prod_before from products \gset
select count(*)::int as mat_before  from materials \gset
select count(*)::int as rec_before  from recipes \gset
select count(*)::int as usr_before  from users \gset

\echo ''
\echo '=== ٢. بلا كلمة التأكيد: مرفوض ==='
do $$ begin
  perform reset_transactions((select id from businesses limit 1),
                             (select id from users where role='owner' limit 1), 'نعم');
  raise notice '✗ صُفِّرت بلا كلمة التأكيد';
exception when others then raise notice '✓ رُفض: %', left(sqlerrm, 60); end $$;

\echo ''
\echo '=== ٣. بيد الباريستا: مرفوض ==='
do $$ begin
  perform reset_transactions((select id from businesses limit 1),
                             (select id from users where role='barista' limit 1), 'تصفير');
  raise notice '✗ صفّرها الباريستا';
exception when others then raise notice '✓ رُفض: %', left(sqlerrm, 60); end $$;

select count(*)::int as orders_still from orders \gset

\echo ''
\echo '=== ٤. المالك بكلمة التأكيد ==='
select reset_transactions(:'biz', :'own', 'تصفير')->'deleted' as "ما حُذف";

\echo ''
\echo '=== ٥. بعد التصفير ==='
select (select count(*)::int from orders) as "طلبات",
       (select count(*)::int from payments) as "دفعات",
       (select count(*)::int from inventory_transactions) as "حركات مخزون",
       (select count(*)::int from shifts) as "ورديات",
       (select cached_stock from materials where name='حبوب الدورادو') as "رصيد الدورادو",
       (select next_number from order_counters limit 1) as "الفاتورة القادمة";

select count(*)::int as orders_after from orders \gset
select count(*)::int as inv_after    from inventory_transactions \gset
select coalesce(sum(cached_stock),0)::int as stock_after from materials \gset
select next_number as next_no from order_counters limit 1 \gset
select count(*)::int as prod_after from products \gset
select count(*)::int as mat_after  from materials \gset
select count(*)::int as rec_after  from recipes \gset
select count(*)::int as usr_after  from users \gset
select count(*)::int as audit_after from audit_log \gset

\echo ''
\echo '=== ٦. الحارس رجع مكانه بعد التصفير ==='
do $$ begin
  update materials set cached_stock = 9999 where name='حبوب الدورادو';
  raise notice '✗ الحارس بقي موقوفاً — الرصيد صار يُكتب بيد';
exception when others then raise notice '✓ الحارس فعّال: %', left(sqlerrm, 55); end $$;

\echo ''
\echo '=== ٧. النظام يبيع بعد التصفير (شراء ثم بيع) ==='
select record_purchase(:'biz',:'branch',:'own',id,
  case base_unit when 'g' then 5000 when 'ml' then 12000 else 300 end,
  case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,'رصيد')
from materials where business_id=:'biz' and active;
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as s2 \gset
select checkout(:'biz',:'branch',:'bar',:'s2','takeaway','cash',5000,'rst-2',
  jsonb_build_array(jsonb_build_object(
    'product_id',(select id from products where name='لاتيه' limit 1),
    'crop_material_id',(select id from materials where name='حبوب الدورادو' limit 1),
    'qty',1)), null, null)->>'order_number' as first_no \gset

\echo ''
\echo '=== الخلاصة ==='
select case when :orders_still = 1
       then '✓ محاولتا التصفير المرفوضتان لم تحذفا شيئاً'
       else format('✗ حُذف رغم الرفض (%s طلب)', :orders_still) end as result
union all
select case when :orders_after = 0 and :inv_after = 0 and :stock_after = 0
       then '✓ الحركات والمخزون صُفِّرت — والرصيد تبع دفتره إلى الصفر'
       else format('✗ طلبات %s · دفتر %s · رصيد %s', :orders_after, :inv_after, :stock_after) end
union all
select case when :prod_after = :prod_before and :mat_after = :mat_before
              and :rec_after = :rec_before and :usr_after = :usr_before
       then '✓ الكتالوج والمستخدمون لم يُمسّوا'
       else format('✗ مشروبات %s/%s · مواد %s/%s · وصفات %s/%s · مستخدمون %s/%s',
                   :prod_after,:prod_before,:mat_after,:mat_before,
                   :rec_after,:rec_before,:usr_after,:usr_before) end
union all
select case when :next_no = 1001 and :first_no::int = 1001
       then '✓ أوّل فاتورة حقيقية رقمها ١٠٠١'
       else format('✗ العدّاد %s وأوّل فاتورة %s', :next_no, :first_no) end
union all
select case when :audit_after = 1
       then '✓ السجلّ الجديد يبدأ بصفٍّ واحد يشرح التصفير نفسه'
       else format('✗ صفوف التدقيق %s', :audit_after) end;
