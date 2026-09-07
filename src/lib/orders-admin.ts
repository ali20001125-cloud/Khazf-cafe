import "server-only";
import { db } from "./db";

/**
 * قراءة الطلبات لشاشات المالك (إلغاء · إرجاع · مراجعة).
 * الكتابة في `src/app/manage/order-actions.ts` خلف صلاحية وموافقة.
 */

export type OrderRow = {
  id: string;
  order_number: number;
  status: string;
  order_type: string;
  fulfillment: string;
  subtotal: number;
  discount: number;
  total: number;
  created_at: string;
  employee_name: string;
  customer_phone: string | null;
  paid_cash: number;
  paid_card: number;
  refunded: number;
};

/** طلبات يوم واحد بتوقيت الفرع، مع ما دُفع وما أُرجع فعلاً. */
export async function ordersForDay(branchId: string, day?: string): Promise<OrderRow[]> {
  return (await db()`
    select o.id, o.order_number, o.status::text as status, o.order_type::text as order_type,
           o.fulfillment::text as fulfillment, o.subtotal, o.discount, o.total, o.created_at,
           u.name as employee_name, c.phone as customer_phone,
           coalesce((select sum(p.amount) from payments p
                      where p.order_id = o.id and p.status = 'CONFIRMED' and p.method = 'cash'), 0)::int as paid_cash,
           coalesce((select sum(p.amount) from payments p
                      where p.order_id = o.id and p.status = 'CONFIRMED' and p.method = 'card'), 0)::int as paid_card,
           coalesce((select sum(r.amount) from refunds r
                      where r.order_id = o.id and r.status = 'COMPLETED'), 0)::int as refunded
    from orders o
    join users u on u.id = o.employee_id
    left join customers c on c.id = o.customer_id
    where o.branch_id = ${branchId}
      and (o.created_at at time zone (select timezone from branches where id = ${branchId}))::date
          = coalesce(${day ?? null}::date, (now() at time zone (select timezone from branches where id = ${branchId}))::date)
    order by o.order_number desc
  `) as OrderRow[];
}

export type OrderDetail = OrderRow & {
  items: { name: string; crop: string | null; qty: number; unit_price: number; is_free: boolean }[];
  voided: { reason: string; created_at: string; voided_by: string } | null;
  refunds: { amount: number; reason: string; created_at: string; requested_by: string; status: string }[];
};

export async function orderDetail(branchId: string, orderId: string): Promise<OrderDetail | null> {
  const rows = (await db()`
    select o.id, o.order_number, o.status::text as status, o.order_type::text as order_type,
           o.fulfillment::text as fulfillment, o.subtotal, o.discount, o.total, o.created_at,
           u.name as employee_name, c.phone as customer_phone,
           coalesce((select sum(p.amount) from payments p
                      where p.order_id = o.id and p.status = 'CONFIRMED' and p.method = 'cash'), 0)::int as paid_cash,
           coalesce((select sum(p.amount) from payments p
                      where p.order_id = o.id and p.status = 'CONFIRMED' and p.method = 'card'), 0)::int as paid_card,
           coalesce((select sum(r.amount) from refunds r
                      where r.order_id = o.id and r.status = 'COMPLETED'), 0)::int as refunded
    from orders o
    join users u on u.id = o.employee_id
    left join customers c on c.id = o.customer_id
    where o.id = ${orderId} and o.branch_id = ${branchId}
  `) as OrderRow[];
  const o = rows[0];
  if (!o) return null;

  const items = (await db()`
    select p.name, m.name as crop, oi.qty, oi.unit_price, oi.is_free
    from order_items oi
    join products p on p.id = oi.product_id
    left join materials m on m.id = oi.crop_material_id
    where oi.order_id = ${orderId}
    order by oi.created_at
  `) as OrderDetail["items"];

  const v = (await db()`
    select vo.reason, vo.created_at, u.name as voided_by
    from order_voids vo join users u on u.id = vo.voided_by
    where vo.order_id = ${orderId}
  `) as { reason: string; created_at: string; voided_by: string }[];

  const refunds = (await db()`
    select r.amount, r.reason, r.created_at, u.name as requested_by, r.status::text as status
    from refunds r join users u on u.id = r.requested_by
    where r.order_id = ${orderId}
    order by r.created_at desc
  `) as OrderDetail["refunds"];

  return { ...o, items, voided: v[0] ?? null, refunds };
}

// ── لوحة الاستثناءات (§56) ───────────────────────────────────────────
export type ExceptionRow = {
  kind: string;
  at: string;
  severity: "high" | "medium";
  detail: Record<string, unknown>;
  user_name: string | null;
};

export async function exceptions(branchId: string): Promise<ExceptionRow[]> {
  return (await db()`
    select e.kind, e.at, e.severity, e.detail, u.name as user_name
    from v_exceptions e
    left join users u on u.id = e.user_id
    where e.branch_id = ${branchId}
    order by (e.severity = 'high') desc, e.at desc nulls last
    limit 60
  `) as ExceptionRow[];
}

/** أسماء عربية لأنواع الاستثناءات — لا تُترجَم في الواجهة. */
export const EXCEPTION_LABELS: Record<string, string> = {
  cash_variance: "فرق في الدرج",
  inventory_variance: "فرق مخزون غير مُفسَّر",
  repeated_variance: "نقص متكرّر — نمط",
  order_voided: "إلغاء بعد الدفع",
  refund: "إرجاع مبلغ",
  no_sale_open: "فتح درج بلا بيع",
  high_waste: "هدر عالٍ",
  excessive_discounts: "كثرة خصومات",
  unusual_staff_drinks: "مشروبات موظفين غير معتادة",
  unusual_loyalty_redemptions: "صرف مكافآت غير معتاد",
};
