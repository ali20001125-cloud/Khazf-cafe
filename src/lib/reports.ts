import "server-only";
import { db } from "./db";

/**
 * تقارير المالك.
 *
 * **«اليوم» هنا = اليوم المحاسبي** (هجرة 0017): يبدأ الساعة التي يحدّدها
 * المالك (افتراضاً ٥ صباحاً) لا منتصف الليل، فبيع الساعة ١ فجراً يُحتسب
 * على اليوم السابق حيث بدأت الوردية. الحساب كلّه في دوال القاعدة
 * (`business_day` · `day_summary`) — لا يُعاد هنا حتى لا تفترق نسختان.
 *
 * **الطلب الملغى خارج كل رقم** (§49): لا يُعدّ طلباً ولا إيراداً ولا كاشاً.
 */

export type TodayGlance = {
  businessDay: string;
  orders: number;
  revenue: number;
  cash: number;
  card: number;
  loyaltyOrders: number;
  staffOrders: number;
  voided: number;
  refunded: number;
  refundsTotal: number;
  discounts: number;
  expectedCash: number;
  actualCash: number;
  cashVariance: number;
  openShifts: number;
  closed: boolean;
};

type DaySummaryRaw = {
  business_day: string;
  orders: number;
  paid_orders: number;
  loyalty_orders: number;
  staff_orders: number;
  voided: number;
  refunded: number;
  revenue: number;
  cash_sales: number;
  card_sales: number;
  discounts: number;
  refunds_total: number;
  expected_cash: number;
  actual_cash: number;
  cash_variance: number;
  open_shifts: number;
  closed: boolean;
};

/** لمحة اليوم المحاسبي — مصدرها `day_summary()` في القاعدة. */
export async function todayGlance(branchId: string, day?: string): Promise<TodayGlance> {
  const rows = (await db()`
    select day_summary(${branchId},
      coalesce(${day ?? null}::date, current_business_day(${branchId}))) as s
  `) as { s: DaySummaryRaw }[];
  const s = rows[0].s;
  return {
    businessDay: s.business_day,
    orders: Number(s.orders),
    revenue: Number(s.revenue),
    cash: Number(s.cash_sales),
    card: Number(s.card_sales),
    loyaltyOrders: Number(s.loyalty_orders),
    staffOrders: Number(s.staff_orders),
    voided: Number(s.voided),
    refunded: Number(s.refunded),
    refundsTotal: Number(s.refunds_total),
    discounts: Number(s.discounts),
    expectedCash: Number(s.expected_cash),
    actualCash: Number(s.actual_cash),
    cashVariance: Number(s.cash_variance),
    openShifts: Number(s.open_shifts),
    closed: Boolean(s.closed),
  };
}

/** اليوم المحاسبي الجاري (نص `YYYY-MM-DD`). */
export async function currentBusinessDay(branchId: string): Promise<string> {
  const r = (await db()`
    select to_char(current_business_day(${branchId}), 'YYYY-MM-DD') as d
  `) as { d: string }[];
  return r[0].d;
}

// ── فروقات الدرج ─────────────────────────────────────────────────────
export type ShiftVariance = {
  id: string;
  employee_name: string;
  opened_at: string;
  closed_at: string;
  opening_float: number;
  counted_cash: number;
  expected_cash: number;
  variance: number;
  business_day: string;
  orders_count: number;
  cash_sales: number;
};

/**
 * الورديات المُغلقة مع فرقها — **مع سياقها**: كم طلباً، وكم بيعاً نقدياً،
 * ومتى فُتحت وأُغلقت. الفرق وحده رقم بلا معنى؛ السياق هو ما يجعله مفهوماً.
 */
export async function recentShiftVariances(branchId: string, limit = 15): Promise<ShiftVariance[]> {
  return (await db()`
    select s.id, u.name as employee_name, s.opened_at, s.closed_at,
           s.opening_float, s.counted_cash, s.expected_cash, s.variance,
           to_char(business_day(s.opened_at, s.branch_id), 'YYYY-MM-DD') as business_day,
           (select count(*) from orders o
             where o.shift_id = s.id and o.status not in ('VOIDED','CANCELLED'))::int as orders_count,
           coalesce((select sum(cm.amount) from cash_movements cm
                      where cm.shift_id = s.id and cm.type = 'SALE'), 0)::int as cash_sales
    from shifts s join users u on u.id = s.employee_id
    where s.branch_id = ${branchId} and s.status = 'CLOSED'
    order by s.closed_at desc nulls last
    limit ${limit}
  `) as ShiftVariance[];
}

// ── فروقات الجرد ─────────────────────────────────────────────────────
export type StockVariance = {
  count_id: string;
  material_name: string;
  expected: number;
  counted: number;
  variance: number;
  variance_pct: number | null;
  equivalent_doses: number | null;
  level: string;
  created_at: string;
};

export async function recentStockVariances(branchId: string, limit = 15): Promise<StockVariance[]> {
  return (await db()`
    select count_id, material_name, expected, counted, variance, variance_pct,
           equivalent_doses, level, created_at
    from v_stock_variance
    where branch_id = ${branchId} and variance <> 0
    order by created_at desc, abs(variance_pct) desc nulls last
    limit ${limit}
  `) as StockVariance[];
}

// ── الأحداث الحسّاسة ─────────────────────────────────────────────────
export type AuditRow = {
  id: string;
  action: string;
  user_name: string | null;
  approved_by_name: string | null;
  reason: string | null;
  entity_type: string | null;
  entity_id: string | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

/**
 * الأحداث الحسّاسة = العمليات التي تمسّ المال أو المخزون أو الصلاحيات،
 * والتي لو حدثت بلا علم المالك لصارت ثغرة. تُعرض بفاعلها ووقتها وسببها،
 * ومن وافق عليها إن كانت تحتاج موافقة.
 */
export async function recentExceptions(businessId: string, limit = 30): Promise<AuditRow[]> {
  return (await db()`
    select a.id, a.action, u.name as user_name, ap.name as approved_by_name,
           a.reason, a.entity_type, a.entity_id, a.after, a.created_at
    from audit_log a
    left join users u on u.id = a.user_id
    left join users ap on ap.id = a.approved_by
    where a.business_id = ${businessId}
      and a.action in ('order_voided','refund_created','discount_applied','login_locked',
                       'close_shift','stock_count','record_waste','cash_drop','cash_removal',
                       'pos_lock','pos_unlock','day_close','day_reopen','no_sale_open',
                       'drawer_handover','staff_drink','loyalty_reward_redeemed',
                       'permission_changed','price_changed')
    order by a.created_at desc
    limit ${limit}
  `) as AuditRow[];
}

// ── المشروبات ────────────────────────────────────────────────────────
export type TopProduct = { name: string; qty: number; revenue: number };

/** أكثر المشروبات مبيعاً في اليوم المحاسبي (بلا الملغى ولا المجاني). */
export async function topProductsToday(branchId: string, day?: string): Promise<TopProduct[]> {
  return (await db()`
    with d as (select coalesce(${day ?? null}::date, current_business_day(${branchId})) as day)
    select p.name, sum(oi.qty)::int as qty, sum(oi.unit_price * oi.qty)::int as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id, d
    where o.branch_id = ${branchId}
      and o.status not in ('VOIDED','CANCELLED')
      and o.order_type = 'SALE'
      and not oi.is_free
      and o.created_at >= business_day_start(${branchId}, d.day)
      and o.created_at <  business_day_end(${branchId}, d.day)
    group by p.name
    order by qty desc
    limit 5
  `) as TopProduct[];
}

export type MonthlyProduct = {
  month: string;
  product_id: string;
  product_name: string;
  qty: number;
  revenue: number;
  avg_per_day: number;
};

/** معدّل بيع كل مشروب شهرياً — أساس قرار الشراء. */
export async function productSalesMonthly(branchId: string, months = 3): Promise<MonthlyProduct[]> {
  return (await db()`
    select month, product_id, product_name, qty, revenue, avg_per_day
    from product_sales_monthly(${branchId}, ${months})
  `) as MonthlyProduct[];
}

// ── مبيعات الأيام السابقة ────────────────────────────────────────────
export type DaySales = { day: string; total: number };

/** مبيعات آخر ٧ أيام محاسبية (الملغى مستثنى). */
export async function salesLast7Days(branchId: string): Promise<DaySales[]> {
  const rows = (await db()`
    with days as (
      select (current_business_day(${branchId}) - g)::date as day
      from generate_series(0, 6) g
    )
    select to_char(d.day, 'YYYY-MM-DD') as day,
           coalesce((
             select sum(o.total)::int from orders o
             where o.branch_id = ${branchId}
               and o.status not in ('VOIDED','CANCELLED')
               and o.order_type = 'SALE'
               and o.created_at >= business_day_start(${branchId}, d.day)
               and o.created_at <  business_day_end(${branchId}, d.day)
           ), 0) as total
    from days d
    order by d.day
  `) as { day: string; total: number }[];
  return rows.map((r) => ({ day: r.day, total: Number(r.total) }));
}

export async function openShiftsCount(branchId: string): Promise<number> {
  const r = (await db()`
    select count(*)::int as n from shifts where branch_id = ${branchId} and status = 'OPEN'
  `) as { n: number }[];
  return r[0]?.n ?? 0;
}
