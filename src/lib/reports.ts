import "server-only";
import { db } from "./db";

/**
 * تقارير المالك (المواصفة §الرؤية): الافتراضي = لمحة اليوم + الشاذّ.
 * «اليوم» = يوم تقويمي بتوقيت بغداد (إغلاق اليوم الرسمي في day_close لاحقاً).
 */

export type TodayGlance = {
  orders: number;
  revenue: number;
  cash: number;
  card: number;
};

export async function todayGlance(branchId: string): Promise<TodayGlance> {
  const o = (await db()`
    select count(*)::int as orders, coalesce(sum(total),0)::int as revenue
    from orders
    where branch_id = ${branchId} and status = 'COMPLETED'
      and paid_at >= date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad'
  `) as { orders: number; revenue: number }[];
  const p = (await db()`
    select p.method, coalesce(sum(p.amount),0)::int as amt
    from payments p
    join orders ord on ord.id = p.order_id
    where ord.branch_id = ${branchId} and p.status = 'CONFIRMED'
      and p.created_at >= date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad'
    group by p.method
  `) as { method: string; amt: number }[];
  const cash = p.find((x) => x.method === "cash")?.amt ?? 0;
  const card = p.find((x) => x.method === "card")?.amt ?? 0;
  return { orders: o[0]?.orders ?? 0, revenue: o[0]?.revenue ?? 0, cash: Number(cash), card: Number(card) };
}

export type ShiftVariance = {
  id: string;
  employee_name: string;
  opened_at: string;
  closed_at: string;
  opening_float: number;
  counted_cash: number;
  expected_cash: number;
  variance: number;
};

export async function recentShiftVariances(branchId: string): Promise<ShiftVariance[]> {
  return (await db()`
    select s.id, u.name as employee_name, s.opened_at, s.closed_at,
           s.opening_float, s.counted_cash, s.expected_cash, s.variance
    from shifts s join users u on u.id = s.employee_id
    where s.branch_id = ${branchId} and s.status = 'CLOSED'
    order by s.closed_at desc nulls last
    limit 10
  `) as ShiftVariance[];
}

export type StockVariance = {
  material_name: string;
  expected: number;
  counted: number;
  variance: number;
  variance_pct: number | null;
  created_at: string;
};

export async function recentStockVariances(branchId: string): Promise<StockVariance[]> {
  return (await db()`
    select m.name as material_name, i.expected, i.counted, i.variance, i.variance_pct, c.created_at
    from stock_count_items i
    join stock_counts c on c.id = i.count_id
    join materials m on m.id = i.material_id
    where c.branch_id = ${branchId} and i.variance <> 0
    order by c.created_at desc, abs(i.variance_pct) desc nulls last
    limit 15
  `) as StockVariance[];
}

export type AuditRow = {
  action: string;
  user_name: string | null;
  reason: string | null;
  created_at: string;
};

/** أحداث حسّاسة حديثة (الشاذّ). */
export async function recentExceptions(businessId: string): Promise<AuditRow[]> {
  return (await db()`
    select a.action, u.name as user_name, a.reason, a.created_at
    from audit_log a
    left join users u on u.id = a.user_id
    where a.business_id = ${businessId}
      and a.action in ('void_paid','refund','apply_discount','login_locked',
                       'close_shift','stock_count','record_waste','cash_drop','pos_lock')
    order by a.created_at desc
    limit 20
  `) as AuditRow[];
}

export type TopProduct = { name: string; qty: number; revenue: number };

/** أكثر المشروبات مبيعاً اليوم. */
export async function topProductsToday(branchId: string): Promise<TopProduct[]> {
  return (await db()`
    select p.name, sum(oi.qty)::int as qty, sum(oi.unit_price * oi.qty)::int as revenue
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    where o.branch_id = ${branchId} and o.status = 'COMPLETED'
      and o.paid_at >= date_trunc('day', now() at time zone 'Asia/Baghdad') at time zone 'Asia/Baghdad'
    group by p.name
    order by qty desc
    limit 5
  `) as TopProduct[];
}

export type DaySales = { day: string; total: number };

/** مبيعات آخر ٧ أيام (بتوقيت بغداد) للرسم البياني. */
export async function salesLast7Days(branchId: string): Promise<DaySales[]> {
  const rows = (await db()`
    select to_char((paid_at at time zone 'Asia/Baghdad')::date, 'YYYY-MM-DD') as day,
           sum(total)::int as total
    from orders
    where branch_id = ${branchId} and status = 'COMPLETED'
      and paid_at >= ((date_trunc('day', now() at time zone 'Asia/Baghdad') - interval '6 days') at time zone 'Asia/Baghdad')
    group by 1 order by 1
  `) as { day: string; total: number }[];
  // املأ الأيام الفارغة
  const out: DaySales[] = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = rows.find((r) => r.day === key);
    out.push({ day: key, total: hit ? Number(hit.total) : 0 });
  }
  return out;
}

export async function openShiftsCount(branchId: string): Promise<number> {
  const r = (await db()`
    select count(*)::int as n from shifts where branch_id = ${branchId} and status = 'OPEN'
  `) as { n: number }[];
  return r[0]?.n ?? 0;
}
