-- =====================================================================
-- 0016 — التقارير وكشف الفروقات (المواصفة §32–§36 · §54–§57)
--
-- المبدأ الحاكم (§57): النظام يعرض «فرق غير مُفسَّر»، لا «سرقة».
-- والنسبة (§34) عتبة تنبيه، لا كمية هدر مسموحة: الفرق يُسجَّل كما هو،
-- ويُترجَم أيضاً إلى «≈ N جرعة» حتى لا يختبئ كوب كامل داخل نسبة صغيرة.
-- =====================================================================

-- ── §33 الاستهلاك النظري: من الحركات المسجَّلة وحدها ────────────────
create or replace view v_material_consumption as
select t.branch_id,
       t.material_id,
       (t.created_at at time zone b.timezone)::date as business_day,
       sum(t.qty_delta) filter (where t.type = 'PURCHASE')::int        as purchased,
       -sum(t.qty_delta) filter (where t.type = 'SALE')::int           as sold,
       -sum(t.qty_delta) filter (where t.type = 'LOYALTY_REWARD')::int as loyalty,
       -sum(t.qty_delta) filter (where t.type = 'STAFF')::int          as staff,
       -sum(t.qty_delta) filter (where t.type = 'WASTE')::int          as waste,
       sum(t.qty_delta) filter (where t.type = 'ADJUSTMENT')::int      as adjusted,
       -sum(t.qty_delta) filter (where t.type in ('SALE','LOYALTY_REWARD','STAFF','WASTE'))::int
         as theoretical_consumption
from inventory_transactions t
join branches b on b.id = t.branch_id
group by t.branch_id, t.material_id, (t.created_at at time zone b.timezone)::date;

comment on view v_material_consumption is
  'المواصفة §33: الاستهلاك النظري = بيع + مكافآت + مشروبات موظفين + هدر مسجَّل. ما ينقص بلا حركة يظهر فرقاً.';

-- ── §32 · §34 · §36 فرق الجرد + مكافئه بالجرعات ─────────────────────
create or replace view v_stock_variance as
select c.id                                as count_id,
       c.branch_id,
       c.created_at,
       (c.created_at at time zone b.timezone)::date as business_day,
       c.user_id,
       i.material_id,
       m.name                              as material_name,
       m.base_unit,
       i.expected,
       i.counted,
       i.variance,
       i.variance_pct,
       b.variance_threshold_pct            as threshold_pct,
       -- «الفرق ≈ N جرعة» (§34): 18غ ≈ جرعة دبل كاملة.
       case when coalesce(m.dose_grams, 0) > 0
            then round(abs(i.variance)::numeric / m.dose_grams, 2) end as equivalent_doses,
       case
         when i.variance >= 0 then 'ok'
         when i.variance_pct is not null
              and abs(i.variance_pct) <= b.variance_threshold_pct then 'within_threshold'
         else 'over_threshold'
       end                                 as level,
       -- التسمية المعتمدة (§57): لا «سرقة».
       case when i.variance < 0 then 'unexplained_variance' else 'surplus' end as label
from stock_counts c
join stock_count_items i on i.count_id = c.id
join materials m on m.id = i.material_id
join branches b on b.id = c.branch_id;

comment on view v_stock_variance is
  'المواصفة §34 · §57: الفرق يُسمّى Unexplained Variance ولا يُكتب أبداً كـWaste. النسبة عتبة تنبيه فقط.';

-- ── §35 كشف النمط: النقص المتكرّر أخطر من النقص الكبير مرّة ─────────
create or replace view v_repeated_variance as
select branch_id,
       material_id,
       material_name,
       base_unit,
       count(*)::int                    as counts_with_shortage,
       sum(variance)::int               as total_shortage,
       round(avg(variance)::numeric, 1) as avg_shortage,
       max(equivalent_doses)            as max_equivalent_doses,
       min(business_day)                as first_seen,
       max(business_day)                as last_seen
from v_stock_variance
where variance < 0
  and created_at > now() - interval '30 days'
group by branch_id, material_id, material_name, base_unit
having count(*) >= 3;

comment on view v_repeated_variance is
  'المواصفة §35: نقص متكرّر بمقدار يقارب جرعة في أيام متتالية — نمط، لا صدفة.';

-- ── §55 لوحة المخزون لمادة/فترة ─────────────────────────────────────
create or replace function inventory_dashboard(
  p_branch_id uuid, p_from date, p_to date
) returns table (
  material_id uuid, material_name text, base_unit material_unit,
  opening int, purchases int, sales int, loyalty int, staff int,
  waste int, adjustments int, expected int, actual int, variance int
)
language sql stable as $$
  with tz as (select timezone from branches where id = p_branch_id),
  moves as (
    select t.material_id, t.type, t.qty_delta,
           (t.created_at at time zone (select timezone from tz))::date as d
    from inventory_transactions t where t.branch_id = p_branch_id
  ),
  agg as (
    select m.id, m.name, m.base_unit, m.cached_stock,
      coalesce(sum(mv.qty_delta) filter (where mv.d < p_from), 0)::int as opening,
      coalesce(sum(mv.qty_delta) filter (where mv.d between p_from and p_to and mv.type = 'PURCHASE'), 0)::int as purchases,
      coalesce(-sum(mv.qty_delta) filter (where mv.d between p_from and p_to and mv.type = 'SALE'), 0)::int as sales,
      coalesce(-sum(mv.qty_delta) filter (where mv.d between p_from and p_to and mv.type = 'LOYALTY_REWARD'), 0)::int as loyalty,
      coalesce(-sum(mv.qty_delta) filter (where mv.d between p_from and p_to and mv.type = 'STAFF'), 0)::int as staff,
      coalesce(-sum(mv.qty_delta) filter (where mv.d between p_from and p_to and mv.type = 'WASTE'), 0)::int as waste,
      coalesce(sum(mv.qty_delta) filter (where mv.d between p_from and p_to and mv.type = 'ADJUSTMENT'), 0)::int as adjustments
    from materials m left join moves mv on mv.material_id = m.id
    where m.active
    group by m.id, m.name, m.base_unit, m.cached_stock
  ),
  last_count as (
    select distinct on (i.material_id) i.material_id, i.counted, c.created_at
    from stock_count_items i join stock_counts c on c.id = i.count_id
    where c.branch_id = p_branch_id and (c.created_at at time zone (select timezone from tz))::date between p_from and p_to
    order by i.material_id, c.created_at desc
  )
  select a.id, a.name, a.base_unit,
         a.opening, a.purchases, a.sales, a.loyalty, a.staff, a.waste, a.adjustments,
         (a.opening + a.purchases - a.sales - a.loyalty - a.staff - a.waste + a.adjustments) as expected,
         lc.counted as actual,
         case when lc.counted is null then null
              else lc.counted - (a.opening + a.purchases - a.sales - a.loyalty - a.staff - a.waste + a.adjustments)
         end as variance
  from agg a left join last_count lc on lc.material_id = a.id
  order by a.name;
$$;

comment on function inventory_dashboard(uuid, date, date) is
  'المواصفة §55: افتتاحي · مشتريات · بيع · مكافآت · موظفين · هدر · تسويات · متوقّع · فعلي · فرق.';

-- ── §54 لمحة اليوم (للمالك فقط — تحوي أرقاماً مالية) ────────────────
create or replace function day_summary(p_branch_id uuid, p_day date)
returns jsonb
language sql stable as $$
  with tz as (select timezone from branches where id = p_branch_id),
  o as (
    select * from orders
    where branch_id = p_branch_id
      and (created_at at time zone (select timezone from tz))::date = p_day
  ),
  pay as (
    select p.method, p.amount from payments p join o on o.id = p.order_id where p.status = 'CONFIRMED'
  ),
  sh as (select * from shifts where branch_id = p_branch_id
          and (opened_at at time zone (select timezone from tz))::date = p_day)
  select jsonb_build_object(
    'orders',           (select count(*) from o),
    'paid_orders',      (select count(*) from o where order_type = 'SALE' and status in ('PAID','COMPLETED')),
    'loyalty_orders',   (select count(*) from o where order_type = 'LOYALTY_REWARD'),
    'staff_orders',     (select count(*) from o where order_type = 'STAFF_DRINK'),
    'voided',           (select count(*) from o where status = 'VOIDED'),
    'refunded',         (select count(*) from o where status in ('REFUNDED','PARTIALLY_REFUNDED')),
    'cash_sales',       (select coalesce(sum(amount),0) from pay where method = 'cash'),
    'card_sales',       (select coalesce(sum(amount),0) from pay where method = 'card'),
    'discounts',        (select coalesce(sum(d.amount),0) from order_discounts d join o on o.id = d.order_id),
    'refunds_total',    (select coalesce(sum(r.amount),0) from refunds r join o on o.id = r.order_id where r.status = 'COMPLETED'),
    'expected_cash',    (select coalesce(sum(coalesce(s.expected_cash, shift_expected_cash(s.id))),0) from sh s),
    'actual_cash',      (select coalesce(sum(s.counted_cash),0) from sh s where s.counted_cash is not null),
    'cash_variance',    (select coalesce(sum(s.variance),0) from sh s where s.variance is not null),
    'closed',           (select exists (select 1 from day_closes where branch_id = p_branch_id and business_day = p_day))
  );
$$;

comment on function day_summary(uuid, date) is
  'المواصفة §54: لوحة المالك. لا تُستدعى إلا خلف صلاحية reports.financial — الباريستا لا يرى شيئاً من هذا.';

-- ── §56 لوحة الاستثناءات: ما يستحقّ نظر المالك فقط ──────────────────
create or replace view v_exceptions as
  -- فرق درج
  select s.branch_id, 'cash_variance' as kind, s.closed_at as at,
         s.employee_id as user_id, s.id as entity_id,
         jsonb_build_object('expected', s.expected_cash, 'actual', s.counted_cash, 'variance', s.variance) as detail,
         case when abs(coalesce(s.variance,0)) >= 10000 then 'high' else 'medium' end as severity
  from shifts s
  where s.status = 'CLOSED' and coalesce(s.variance, 0) <> 0
    and s.closed_at > now() - interval '30 days'
union all
  -- فرق مخزون غير مُفسَّر تجاوز العتبة
  select v.branch_id, 'inventory_variance', v.created_at, v.user_id, v.count_id,
         jsonb_build_object('material', v.material_name, 'variance', v.variance,
                            'pct', v.variance_pct, 'doses', v.equivalent_doses),
         case when v.level = 'over_threshold' then 'high' else 'medium' end
  from v_stock_variance v
  where v.variance < 0 and v.created_at > now() - interval '30 days'
union all
  -- نقص متكرّر (النمط أخطر من الحادثة)
  select r.branch_id, 'repeated_variance', now(), null, null,
         jsonb_build_object('material', r.material_name, 'times', r.counts_with_shortage,
                            'total', r.total_shortage, 'doses', r.max_equivalent_doses),
         'high'
  from v_repeated_variance r
union all
  -- إلغاء بعد الدفع
  select o.branch_id, 'order_voided', vo.created_at, vo.voided_by, o.id,
         jsonb_build_object('order_number', o.order_number, 'total', o.total, 'reason', vo.reason),
         'high'
  from order_voids vo join orders o on o.id = vo.order_id
  where vo.created_at > now() - interval '30 days'
union all
  -- إرجاع
  select rf.branch_id, 'refund', rf.created_at, rf.requested_by, rf.order_id,
         jsonb_build_object('amount', rf.amount, 'reason', rf.reason, 'approved_by', rf.approved_by),
         'high'
  from refunds rf
  where rf.status = 'COMPLETED' and rf.created_at > now() - interval '30 days'
union all
  -- فتح درج بلا بيع
  select n.branch_id, 'no_sale_open', n.created_at, n.user_id, n.id,
         jsonb_build_object('reason', n.reason), 'medium'
  from no_sale_opens n
  where n.created_at > now() - interval '30 days'
union all
  -- هدر عالٍ في يوم واحد لمادة واحدة
  select t.branch_id, 'high_waste', max(t.created_at), null, t.material_id,
         jsonb_build_object('material', m.name, 'qty', -sum(t.qty_delta)), 'medium'
  from inventory_transactions t join materials m on m.id = t.material_id
  where t.type = 'WASTE' and t.created_at > now() - interval '30 days'
    and coalesce(m.dose_grams, 0) > 0
  group by t.branch_id, t.material_id, m.name, m.dose_grams,
           (t.created_at at time zone 'Asia/Baghdad')::date
  having -sum(t.qty_delta) > 5 * max(m.dose_grams)
union all
  -- كثرة الخصومات
  select o.branch_id, 'excessive_discounts', max(d.created_at), d.applied_by, null,
         jsonb_build_object('count', count(*), 'total', sum(d.amount)), 'medium'
  from order_discounts d join orders o on o.id = d.order_id
  where d.created_at > now() - interval '7 days'
  group by o.branch_id, d.applied_by
  having count(*) >= 10
union all
  -- مشروبات موظفين غير معتادة
  select o.branch_id, 'unusual_staff_drinks', max(o.created_at), o.employee_id, null,
         jsonb_build_object('count', count(*)), 'medium'
  from orders o
  where o.order_type = 'STAFF_DRINK' and o.created_at > now() - interval '7 days'
  group by o.branch_id, o.employee_id
  having count(*) >= 15
union all
  -- صرف مكافآت غير معتاد
  select o.branch_id, 'unusual_loyalty_redemptions', max(o.created_at), o.employee_id, null,
         jsonb_build_object('count', count(*)), 'medium'
  from orders o
  where o.order_type = 'LOYALTY_REWARD' and o.created_at > now() - interval '7 days'
  group by o.branch_id, o.employee_id
  having count(*) >= 20;

comment on view v_exceptions is
  'المواصفة §56: بدل قراءة كل العمليات — ما شذّ فقط. العتبات هنا افتراضات أوّلية تُضبط من الإعدادات.';
