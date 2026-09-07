import "server-only";
import { db } from "./db";

/**
 * تفصيل وردية واحدة — لأن «فرق −٥٬٠٠٠» رقم بلا معنى وحده.
 * المالك يحتاج أن يرى: من فتحها ومتى، وكم بيعاً نقدياً دخل الدرج، وأي
 * سحب خرج منه، وأي طلب أُلغي أو أُرجع، ومتى عُدّ الدرج — ثم يحكم بنفسه.
 */

export type ShiftDetail = {
  id: string;
  employee_name: string;
  drawer_owner_name: string | null;
  business_day: string;
  opened_at: string;
  closed_at: string | null;
  status: string;
  opening_float: number;
  counted_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
};

export type ShiftMovement = {
  at: string;
  kind: string;
  amount: number;
  reason: string | null;
  user_name: string | null;
};

export type ShiftOrder = {
  order_number: number;
  status: string;
  order_type: string;
  total: number;
  method: string | null;
  at: string;
  refunded: number;
};

export type ShiftEvent = {
  at: string;
  action: string;
  user_name: string | null;
  approved_by_name: string | null;
  reason: string | null;
};

export async function getShiftDetail(
  branchId: string,
  shiftId: string
): Promise<ShiftDetail | null> {
  const rows = (await db()`
    select s.id, u.name as employee_name, d.name as drawer_owner_name,
           to_char(business_day(s.opened_at, s.branch_id), 'YYYY-MM-DD') as business_day,
           s.opened_at, s.closed_at, s.status::text as status,
           s.opening_float, s.counted_cash, s.expected_cash, s.variance
    from shifts s
    join users u on u.id = s.employee_id
    left join users d on d.id = s.drawer_owner_id
    where s.id = ${shiftId} and s.branch_id = ${branchId}
  `) as ShiftDetail[];
  return rows[0] ?? null;
}

/** كل حركة نقد في الوردية بترتيبها — هذا ما يبني «المتوقّع». */
export async function getShiftMovements(shiftId: string): Promise<ShiftMovement[]> {
  return (await db()`
    select cm.created_at as at, cm.type::text as kind, cm.amount, cm.reason, u.name as user_name
    from cash_movements cm
    left join users u on u.id = cm.user_id
    where cm.shift_id = ${shiftId}
    order by cm.created_at
  `) as ShiftMovement[];
}

export async function getShiftOrders(shiftId: string): Promise<ShiftOrder[]> {
  return (await db()`
    select o.order_number, o.status::text as status, o.order_type::text as order_type,
           o.total, o.created_at as at,
           (select p.method::text from payments p
             where p.order_id = o.id and p.status = 'CONFIRMED' limit 1) as method,
           coalesce((select sum(r.amount) from refunds r
                      where r.order_id = o.id and r.status = 'COMPLETED'), 0)::int as refunded
    from orders o
    where o.shift_id = ${shiftId}
    order by o.order_number
  `) as ShiftOrder[];
}

/** أحداث التدقيق التي وقعت خلال الوردية — الهدر والسحب والإلغاء وغيرها. */
export async function getShiftEvents(
  branchId: string,
  openedAt: string,
  closedAt: string | null
): Promise<ShiftEvent[]> {
  return (await db()`
    select a.created_at as at, a.action, u.name as user_name,
           ap.name as approved_by_name, a.reason
    from audit_log a
    left join users u on u.id = a.user_id
    left join users ap on ap.id = a.approved_by
    where a.branch_id = ${branchId}
      and a.created_at >= ${openedAt}
      and a.created_at <= coalesce(${closedAt ?? null}::timestamptz, now())
      and a.action not in ('login', 'logout')
    order by a.created_at
  `) as ShiftEvent[];
}
