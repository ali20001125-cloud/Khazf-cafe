-- =====================================================================
-- البيع بلا إنترنت: الفاتورة تحمل وقتها لا وقت رفعها
--
-- انقطاع الشبكة ليس حالةً نادرة، وبيعٌ لا يتمّ لأن الشبكة غابت خسارةٌ
-- مضاعفة: زبونٌ ينتظر ومالٌ لا يُسجَّل. فالكاشير يُتمّ البيع محلياً ويرفعه
-- حين تعود.
--
-- والخطر هنا ليس فقدان الفاتورة — المفتاح الفريد يمنع تكرارها — بل
-- **وقتها**: بيعٌ تمّ ١١ ليلاً ورُفع ٨ صباحاً كان سيُكتب بوقت الرفع، فينتقل
-- إلى يوم محاسبي آخر، ويظهر نقدُه في درج وردية لم تقبضه.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches   limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner'   limit 1 \gset
select id as latte  from products where name='لاتيه'   limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset

update branches set day_start_hour = 5 where id = :'branch';
select record_purchase(:'biz',:'branch',:'own',id,
  case base_unit when 'g' then 5000 when 'ml' then 12000 else 300 end,
  case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,'رصيد')
from materials where business_id=:'biz' and active;

-- وردية الليلة: فُتحت ١٠ مساءً وأُغلقت ١ فجراً
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status,opened_at)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN', timestamptz '2026-09-12 22:00 +03')
returning id as night \gset

\echo '=== ١. بيعان: واحد وصل مباشرة، وواحد انقطعت عنه الشبكة ==='
select (checkout(:'biz',:'branch',:'bar',:'night','takeaway','cash',5000,'on-1',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),
  null,null, timestamptz '2026-09-12 22:30 +03')->>'order_number') as "فاتورة اتصال";

-- البيع المؤجّل: تمّ ٢٣:١٠، ويُرفع الآن (الصباح التالي)
select (checkout(:'biz',:'branch',:'bar',:'night','takeaway','cash',5000,'off-1',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),
  null,null, timestamptz '2026-09-12 23:10 +03')->>'order_number') as "فاتورة مؤجّلة";

\echo ''
\echo '=== ٢. كلاهما في يوم الليلة المحاسبي، لا في يوم الرفع ==='
select o.order_number as "الفاتورة",
       (o.created_at at time zone 'Asia/Baghdad')::timestamp(0) as "وقت البيع",
       business_day(o.created_at, o.branch_id) as "اليوم المحاسبي"
from orders o order by o.order_number;

\echo ''
\echo '=== ٣. الدفتر وحركة الكاش يحملان لحظة البيع نفسها ==='
select 'الدفعة' as "السجلّ", (p.created_at at time zone 'Asia/Baghdad')::timestamp(0) as "الوقت"
from payments p where p.idempotency_key = 'off-1'
union all
select 'حركة الكاش', (c.created_at at time zone 'Asia/Baghdad')::timestamp(0)
from cash_movements c where c.type='SALE' and c.created_at = timestamptz '2026-09-12 23:10 +03'
union all
select 'حركة المخزون', (min(t.created_at) at time zone 'Asia/Baghdad')::timestamp(0)
from inventory_transactions t
where t.order_id = (select id from orders where order_number = 1002);

\echo ''
\echo '=== ٤. رفعٌ مكرّر لنفس المفتاح لا يُنتج فاتورة ثانية ==='
select (checkout(:'biz',:'branch',:'bar',:'night','takeaway','cash',5000,'off-1',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),
  null,null, timestamptz '2026-09-12 23:10 +03')->>'replay')::boolean as "رُدّت الأولى";
select count(*)::int as "عدد الفواتير" from orders;

\echo ''
\echo '=== ٥. نقد الليلة في درج الليلة ==='
select shift_expected_cash(:'night') as "المتوقّع في درج الوردية";

\echo ''
\echo '=== ٦. مبيعات اليومين ==='
select business_day(o.created_at, o.branch_id) as "اليوم",
       count(*) as "فواتير", sum(o.total) as "المبيعات"
from orders o group by 1 order by 1;

\echo ''
\echo '=== الخلاصة ==='
select case when (select count(*) from orders
                   where business_day(created_at, branch_id) = date '2026-09-12') = 2
       then '✓ البيع المؤجّل بقي في ليلته — لم ينتقل ليوم الرفع'
       else '✗ البيع المؤجّل انتقل إلى يوم آخر' end as result
union all
select case when (select count(distinct created_at) from (
         select created_at from payments where idempotency_key='off-1'
         union all select created_at from cash_movements
           where created_at = timestamptz '2026-09-12 23:10 +03'
         union all select created_at from inventory_transactions
           where order_id = (select id from orders where order_number=1002)
       ) x) = 1
       then '✓ الفاتورة والدفعة والدفتر والدرج بلحظة واحدة'
       else '✗ سجلّات البيع الواحد متفرّقة في الزمن' end
union all
select case when (select count(*)::int from orders) = 2
       then '✓ الرفع المكرّر لم يُنتج فاتورة ثانية'
       else '✗ تكرّرت الفاتورة عند إعادة الرفع' end
union all
select case when shift_expected_cash(:'night') = 50000 + 3500 + 3500
       then '✓ نقد البيعين في درج ورديتهما'
       else '✗ نقد الليلة ليس في درج الليلة' end;
