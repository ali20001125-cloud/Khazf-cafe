-- =====================================================================
-- 0017 — «اليوم المحاسبي» يبدأ بساعة يحدّدها المالك، لا بمنتصف الليل
--
-- المشكلة الحقيقية: المقهى قد يُغلق وردية الساعة ١ فجراً. بحساب منتصف
-- الليل تنتقل مبيعات تلك الساعة إلى اليوم التالي، فيظهر يوم ناقص ويوم
-- منتفخ، ويصير فرق الدرج معلّقاً بين يومين.
--
-- الحلّ: **اليوم يبدأ الساعة X** (افتراضاً ٥ صباحاً، وقت لا يعمل فيه
-- المقهى عادةً). بيع الساعة ١ فجراً ينتمي لليوم السابق — وهذا ما تفعله
-- أنظمة الكاشير التجارية (Square · Loyverse · Toast) وتسمّيه
-- "business day start".
--
-- كل حساب «يومي» في النظام يمرّ من هنا: لا تكرار للصيغة في مكانين.
-- =====================================================================

alter table branches add column if not exists day_start_hour integer not null default 5;

alter table branches drop constraint if exists branches_day_start_hour_range;
alter table branches add constraint branches_day_start_hour_range
  check (day_start_hour between 0 and 23);

comment on column branches.day_start_hour is
  'الساعة التي يبدأ عندها اليوم المحاسبي بتوقيت الفرع (٠–٢٣). ٥ = يوم العمل يمتدّ من ٥ صباحاً حتى ٥ صباح الغد، فبيع الساعة ١ فجراً يُحتسب على اليوم السابق.';

-- ── اليوم المحاسبي لأي لحظة ─────────────────────────────────────────
create or replace function business_day(p_ts timestamptz, p_branch_id uuid)
returns date
language sql stable as $$
  select ((p_ts at time zone b.timezone) - make_interval(hours => b.day_start_hour))::date
  from branches b where b.id = p_branch_id;
$$;

comment on function business_day(timestamptz, uuid) is
  'اليوم المحاسبي الذي تقع فيه هذه اللحظة. المصدر الوحيد لهذا الحساب — لا يُعاد في SQL ولا في الخادم.';

/** اليوم المحاسبي الجاري الآن. */
create or replace function current_business_day(p_branch_id uuid)
returns date
language sql stable as $$
  select business_day(now(), p_branch_id);
$$;

-- ── حدود اليوم المحاسبي (للاستعلامات التي تحتاج مدى زمنياً) ─────────
create or replace function business_day_start(p_branch_id uuid, p_day date)
returns timestamptz
language sql stable as $$
  select ((p_day + make_interval(hours => b.day_start_hour)) at time zone b.timezone)
  from branches b where b.id = p_branch_id;
$$;

create or replace function business_day_end(p_branch_id uuid, p_day date)
returns timestamptz
language sql stable as $$
  select business_day_start(p_branch_id, p_day + 1);
$$;

comment on function business_day_start(uuid, date) is
  'بداية اليوم المحاسبي كطابع زمني — تُستخدم في الاستعلامات بدل مقارنة التواريخ (تستفيد من الفهارس).';

-- =====================================================================
-- إعادة بناء كل ما كان يحسب اليوم بمنتصف الليل
-- =====================================================================

-- ── قفل اليوم المُغلق (§53) ─────────────────────────────────────────
create or replace function khazaf_day_closed_guard() returns trigger
language plpgsql as $$
declare v_day date;
begin
  if coalesce(current_setting('khazaf.reopen', true), 'off') = 'on' then
    return new;
  end if;
  v_day := current_business_day(new.branch_id);
  if exists (select 1 from day_closes d where d.branch_id = new.branch_id and d.business_day = v_day) then
    raise exception 'اليوم المحاسبي % مُغلق لهذا الفرع — لا عمليات جديدة إلا بإعادة فتحه (§53)', v_day
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

-- ── الاستهلاك النظري (§33) ──────────────────────────────────────────
create or replace view v_material_consumption as
select t.branch_id,
       t.material_id,
       business_day(t.created_at, t.branch_id) as business_day,
       sum(t.qty_delta) filter (where t.type = 'PURCHASE')::int        as purchased,
       -sum(t.qty_delta) filter (where t.type = 'SALE')::int           as sold,
       -sum(t.qty_delta) filter (where t.type = 'LOYALTY_REWARD')::int as loyalty,
       -sum(t.qty_delta) filter (where t.type = 'STAFF')::int          as staff,
       -sum(t.qty_delta) filter (where t.type = 'WASTE')::int          as waste,
       sum(t.qty_delta) filter (where t.type = 'ADJUSTMENT')::int      as adjusted,
       -sum(t.qty_delta) filter (where t.type in ('SALE','LOYALTY_REWARD','STAFF','WASTE'))::int
         as theoretical_consumption
from inventory_transactions t
group by t.branch_id, t.material_id, business_day(t.created_at, t.branch_id);

-- ── فروقات الجرد (§34) ──────────────────────────────────────────────
create or replace view v_stock_variance as
select c.id                                as count_id,
       c.branch_id,
       c.created_at,
       business_day(c.created_at, c.branch_id) as business_day,
       c.user_id,
       i.material_id,
       m.name                              as material_name,
       m.base_unit,
       i.expected,
       i.counted,
       i.variance,
       i.variance_pct,
       b.variance_threshold_pct            as threshold_pct,
       case when coalesce(m.dose_grams, 0) > 0
            then round(abs(i.variance)::numeric / m.dose_grams, 2) end as equivalent_doses,
       case
         when i.variance >= 0 then 'ok'
         when i.variance_pct is not null
              and abs(i.variance_pct) <= b.variance_threshold_pct then 'within_threshold'
         else 'over_threshold'
       end                                 as level,
       case when i.variance < 0 then 'unexplained_variance' else 'surplus' end as label
from stock_counts c
join stock_count_items i on i.count_id = c.id
join materials m on m.id = i.material_id
join branches b on b.id = c.branch_id;

-- =====================================================================
-- §54 لمحة اليوم — على حدود اليوم المحاسبي، وبلا الطلبات الملغاة
-- =====================================================================
-- الملغى (§49) لم يقع بيعاً: لا يدخل الطلبات ولا الإيراد ولا الكاش، ولو
-- بقي صفّ الدفع محفوظاً في التاريخ. لو قُبض المال فعلاً فطريقه الإرجاع.
create or replace function day_summary(p_branch_id uuid, p_day date)
returns jsonb
language sql stable as $$
  with bounds as (
    select business_day_start(p_branch_id, p_day) as t0,
           business_day_end(p_branch_id, p_day)   as t1
  ),
  o as (
    select * from orders, bounds
    where branch_id = p_branch_id and created_at >= bounds.t0 and created_at < bounds.t1
  ),
  live as (select * from o where status not in ('VOIDED','CANCELLED')),
  pay as (
    select p.method, p.amount from payments p join live on live.id = p.order_id
    where p.status = 'CONFIRMED'
  ),
  sh as (
    select s.* from shifts s, bounds
    where s.branch_id = p_branch_id and s.opened_at >= bounds.t0 and s.opened_at < bounds.t1
  )
  select jsonb_build_object(
    'business_day',     p_day,
    'orders',           (select count(*) from live),
    'paid_orders',      (select count(*) from live where order_type = 'SALE'),
    'loyalty_orders',   (select count(*) from live where order_type = 'LOYALTY_REWARD'),
    'staff_orders',     (select count(*) from live where order_type = 'STAFF_DRINK'),
    'voided',           (select count(*) from o where status = 'VOIDED'),
    'refunded',         (select count(*) from o where status in ('REFUNDED','PARTIALLY_REFUNDED')),
    'revenue',          (select coalesce(sum(total),0) from live where order_type = 'SALE'),
    'cash_sales',       (select coalesce(sum(amount),0) from pay where method = 'cash'),
    'card_sales',       (select coalesce(sum(amount),0) from pay where method = 'card'),
    'discounts',        (select coalesce(sum(d.amount),0) from order_discounts d join live on live.id = d.order_id),
    'refunds_total',    (select coalesce(sum(r.amount),0) from refunds r join o on o.id = r.order_id where r.status = 'COMPLETED'),
    'expected_cash',    (select coalesce(sum(coalesce(s.expected_cash, shift_expected_cash(s.id))),0) from sh s),
    'actual_cash',      (select coalesce(sum(s.counted_cash),0) from sh s where s.counted_cash is not null),
    'cash_variance',    (select coalesce(sum(s.variance),0) from sh s where s.variance is not null),
    'open_shifts',      (select count(*) from sh s where s.status = 'OPEN'),
    'closed',           (select exists (select 1 from day_closes where branch_id = p_branch_id and business_day = p_day))
  );
$$;

comment on function day_summary(uuid, date) is
  'المواصفة §54: لوحة المالك على حدود اليوم المحاسبي. الطلب الملغى خارج كل الأرقام (§49). خلف صلاحية reports.financial.';

-- =====================================================================
-- §55 لوحة المخزون — على حدود اليوم المحاسبي
-- =====================================================================
create or replace function inventory_dashboard(
  p_branch_id uuid, p_from date, p_to date
) returns table (
  material_id uuid, material_name text, base_unit material_unit,
  opening int, purchases int, sales int, loyalty int, staff int,
  waste int, adjustments int, expected int, actual int, variance int
)
language sql stable as $$
  with bounds as (
    select business_day_start(p_branch_id, p_from) as t0,
           business_day_end(p_branch_id, p_to)     as t1
  ),
  agg as (
    select m.id, m.name, m.base_unit,
      coalesce(sum(t.qty_delta) filter (where t.created_at < bounds.t0), 0)::int as opening,
      coalesce(sum(t.qty_delta) filter (where t.created_at >= bounds.t0 and t.created_at < bounds.t1 and t.type = 'PURCHASE'), 0)::int as purchases,
      coalesce(-sum(t.qty_delta) filter (where t.created_at >= bounds.t0 and t.created_at < bounds.t1 and t.type = 'SALE'), 0)::int as sales,
      coalesce(-sum(t.qty_delta) filter (where t.created_at >= bounds.t0 and t.created_at < bounds.t1 and t.type = 'LOYALTY_REWARD'), 0)::int as loyalty,
      coalesce(-sum(t.qty_delta) filter (where t.created_at >= bounds.t0 and t.created_at < bounds.t1 and t.type = 'STAFF'), 0)::int as staff,
      coalesce(-sum(t.qty_delta) filter (where t.created_at >= bounds.t0 and t.created_at < bounds.t1 and t.type = 'WASTE'), 0)::int as waste,
      coalesce(sum(t.qty_delta) filter (where t.created_at >= bounds.t0 and t.created_at < bounds.t1 and t.type = 'ADJUSTMENT'), 0)::int as adjustments
    from materials m
    cross join bounds
    left join inventory_transactions t on t.material_id = m.id and t.branch_id = p_branch_id
    where m.active
    group by m.id, m.name, m.base_unit
  ),
  last_count as (
    select distinct on (i.material_id) i.material_id, i.counted
    from stock_count_items i join stock_counts c on c.id = i.count_id, bounds
    where c.branch_id = p_branch_id and c.created_at >= bounds.t0 and c.created_at < bounds.t1
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

-- =====================================================================
-- تقارير جديدة يحتاجها المالك
-- =====================================================================

-- ── معدّل بيع كل مشروب شهرياً ────────────────────────────────────────
-- لماذا: المالك يشتري الحبوب والحليب مقدّماً، فيحتاج «كم أبيع من هذا
-- المشروب في الشهر» لا «كم بعت اليوم». الملغى والمُرجَع خارج الحساب.
create or replace function product_sales_monthly(
  p_branch_id uuid, p_months integer default 3
) returns table (
  month text, product_id uuid, product_name text,
  qty int, revenue int, avg_per_day numeric
)
language sql stable as $$
  with sold as (
    select to_char(business_day(o.created_at, o.branch_id), 'YYYY-MM') as month,
           business_day(o.created_at, o.branch_id) as bday,
           oi.product_id, p.name as product_name, oi.qty, oi.unit_price
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    where o.branch_id = p_branch_id
      and o.order_type = 'SALE'
      and o.status not in ('VOIDED','CANCELLED')
      and not oi.is_free
      and o.created_at >= now() - make_interval(months => greatest(p_months, 1))
  )
  select s.month, s.product_id, s.product_name,
         sum(s.qty)::int as qty,
         sum(s.qty * s.unit_price)::int as revenue,
         round(sum(s.qty)::numeric / greatest(count(distinct s.bday), 1), 1) as avg_per_day
  from sold s
  group by s.month, s.product_id, s.product_name
  order by s.month desc, qty desc;
$$;

comment on function product_sales_monthly(uuid, integer) is
  'معدّل بيع كل مشروب شهرياً ومتوسّطه اليومي — أساس قرار الشراء. الملغى والمجاني خارج الحساب.';

-- ── حركة مادة واحدة: الرصيد التراكمي سطراً بسطر ─────────────────────
-- لماذا: «٥ كيلو، بعنا ١٫٥، بقي ٣٫٥، أضفت ١ كيلو» — المالك يريد أن يرى
-- هذا التسلسل بعينه، لا رقماً نهائياً بلا تفسير.
create or replace function material_ledger(
  p_material_id uuid, p_limit integer default 60
) returns table (
  at timestamptz, kind text, qty_delta int, running_balance bigint,
  reason text, user_name text, order_number int
)
language sql stable as $$
  select t.created_at as at,
         t.type::text as kind,
         t.qty_delta,
         sum(t.qty_delta) over (order by t.created_at, t.id
                                rows between unbounded preceding and current row) as running_balance,
         t.reason,
         u.name as user_name,
         o.order_number
  from inventory_transactions t
  left join users u on u.id = t.user_id
  left join orders o on o.id = t.order_id
  where t.material_id = p_material_id
  order by t.created_at desc, t.id desc
  limit greatest(p_limit, 1);
$$;

comment on function material_ledger(uuid, integer) is
  'حركات مادة واحدة مع الرصيد التراكمي بعد كل حركة — يفسّر «كيف وصلنا لهذا الرصيد».';
