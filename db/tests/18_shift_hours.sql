-- =====================================================================
-- الدوام والوقت الإضافي · والبيع الذي تمّ بلا إنترنت
--
-- الوقت الإضافي بلا دليلٍ عليه ظنٌّ لا حساب. ومن يدفع على الظنّ يدفع
-- مرّتين: مرّةً مالاً، ومرّةً حين يعرف الموظفون أن البقاء وحده يُدفع.
-- فالدليل هنا هو الفاتورة: مالٌ دخل الدرج في تلك الدقيقة بالذات.
--
-- والنظام **لا يخفي** الدقائق التي بلا فواتير — يعرضها ولا يحتسبها.
-- الفرق بين «لم يحدث» و«حدث ولم يُثبَت» فرقٌ يملكه المالك لا النظام.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches   limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner'   limit 1 \gset

update branches set shift_start_hour = 16, shift_end_hour = 24, overtime_min_orders = 1
where id = :'branch';

select record_purchase(:'biz',:'branch',:'own',id,
  case base_unit when 'g' then 5000 when 'ml' then 12000 else 300 end,
  case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,'رصيد')
from materials where business_id=:'biz' and active;

-- بيعٌ بوقتٍ محدَّد: نمرّر لحظته الحقيقية كما يفعل الرفع بعد انقطاع النت.
create or replace function _sell_at(p_shift uuid, p_key text, p_at timestamptz)
returns jsonb language sql as $$
  select checkout(
    (select id from businesses limit 1), (select id from branches limit 1),
    (select id from users where role='barista' limit 1), p_shift,
    'takeaway','cash',5000,p_key,
    jsonb_build_array(jsonb_build_object(
      'product_id',(select id from products where name='لاتيه' limit 1),
      'crop_material_id',(select id from materials where name='حبوب الدورادو' limit 1),
      'qty',1)),
    null, null, p_at);
$$;

-- إغلاق بوقتٍ محدَّد: مسار أدوات اختبار لا يمرّ به التطبيق (كما في 11).
create or replace function _close_at(p_shift uuid, p_at timestamptz, p_counted integer)
returns void language plpgsql as $$
begin
  set local session_replication_role = replica;
  update shifts set status = 'CLOSED', closed_at = p_at,
                    counted_cash = p_counted, expected_cash = p_counted, variance = 0
  where id = p_shift;
end $$;

\echo '=== ١. وردية داخل الدوام تماماً: ٤ عصراً ← ١١:٣٠ ليلاً ==='
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status,opened_at)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN',
        ('2026-09-10 16:00'::timestamp at time zone 'Asia/Baghdad')) returning id as s1 \gset
select _sell_at(:'s1','h-1', '2026-09-10 18:00'::timestamp at time zone 'Asia/Baghdad')->>'order_number' as "فاتورة";
select _close_at(:'s1', '2026-09-10 23:30'::timestamp at time zone 'Asia/Baghdad', 55000);

select regular_minutes as regular, overtime_minutes as ot, early_minutes as early,
       overtime_orders as ot_orders
from v_shift_hours where shift_id = :'s1' \gset

\echo ''
\echo '=== ٢. وردية امتدّت لـ٢ فجراً وباعت بعد منتصف الليل ==='
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status,opened_at)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN',
        ('2026-09-11 16:00'::timestamp at time zone 'Asia/Baghdad')) returning id as s2 \gset
select _sell_at(:'s2','h-2', '2026-09-11 20:00'::timestamp at time zone 'Asia/Baghdad')->>'order_number' as "فاتورة";
select _sell_at(:'s2','h-3', '2026-09-12 00:40'::timestamp at time zone 'Asia/Baghdad')->>'order_number' as "بعد منتصف الليل";
select _close_at(:'s2', '2026-09-12 02:00'::timestamp at time zone 'Asia/Baghdad', 60000);

select regular_minutes as regular2, overtime_minutes as ot2, overtime_orders as ot_orders2
from v_shift_hours where shift_id = :'s2' \gset

\echo ''
\echo '=== ٣. وردية امتدّت ساعةً بلا بيعة واحدة ==='
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status,opened_at)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN',
        ('2026-09-12 15:30'::timestamp at time zone 'Asia/Baghdad')) returning id as s3 \gset
select _sell_at(:'s3','h-4', '2026-09-12 19:00'::timestamp at time zone 'Asia/Baghdad')->>'order_number' as "فاتورة";
select _close_at(:'s3', '2026-09-13 01:00'::timestamp at time zone 'Asia/Baghdad', 55000);

select regular_minutes as regular3, overtime_minutes as ot3, early_minutes as early3,
       overtime_orders as ot_orders3
from v_shift_hours where shift_id = :'s3' \gset

\echo ''
\echo '=== ٤. كشف الساعات للمدّة كلّها ==='
select employee_name as "الموظف", shifts as "ورديات",
       regular_minutes as "عاديّ (د)", overtime_minutes as "إضافيّ (د)",
       paid_overtime_minutes as "يُدفع", unpaid_overtime_minutes as "لا يُدفع",
       early_minutes as "قبل الدوام"
from staff_hours(:'biz', '2026-09-10', '2026-09-13');

select paid_overtime_minutes as paid, unpaid_overtime_minutes as unpaid
from staff_hours(:'biz', '2026-09-10', '2026-09-13') limit 1 \gset

\echo ''
\echo '=== ٥. البيع بلا إنترنت كما تراه الإدارة ==='
select offline_status(:'branch', 30) as "الحالة";
select (offline_status(:'branch', 30)->>'orders_offline')::int as off_n,
       (offline_status(:'branch', 30)->>'last_sync_at' is not null) as has_sync \gset

\echo ''
\echo '=== الخلاصة ==='
select case when :regular = 450 and :ot = 0 and :early = 0
       then '✓ وردية داخل الدوام: ٤٥٠ دقيقة عاديّ ولا إضافيّ'
       else format('✗ عاديّ %s · إضافيّ %s · قبل الدوام %s', :regular, :ot, :early) end as result
union all
select case when :regular2 = 480 and :ot2 = 120 and :ot_orders2 = 1
       then '✓ ما بعد منتصف الليل إضافيّ (١٢٠ د) ومعه فاتورته'
       else format('✗ عاديّ %s · إضافيّ %s · فواتير %s', :regular2, :ot2, :ot_orders2) end
union all
select case when :early3 = 30 and :ot3 = 60 and :ot_orders3 = 0
       then '✓ نصف ساعة قبل الدوام تُعرض، وساعةٌ بعده بلا فاتورة'
       else format('✗ قبل %s · إضافيّ %s · فواتير %s', :early3, :ot3, :ot_orders3) end
union all
select case when :paid = 120 and :unpaid = 60
       then '✓ يُدفع ما أثبتته الفواتير (١٢٠ د) ولا يُدفع ما لم تُثبته (٦٠ د)'
       else format('✗ يُدفع %s · لا يُدفع %s', :paid, :unpaid) end
union all
select case when :off_n = 4 and :'has_sync' = 't'
       then '✓ الإدارة ترى الفواتير التي بيعت بلا إنترنت ووقت آخر مزامنة'
       else format('✗ بلا إنترنت %s · آخر مزامنة %s', :off_n, :'has_sync') end;
