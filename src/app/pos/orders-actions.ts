"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";

export type ShiftOrderLine = { name: string; qty: number; unit_price: number };
export type ShiftOrder = {
  orderNumber: number;
  at: string;
  fulfillment: "takeaway" | "dine_in";
  method: "cash" | "card" | null;
  total: number;
  change: number | null;
  lines: ShiftOrderLine[];
};

/**
 * طلبات الوردية المفتوحة الحالية (لإعادة الطباعة).
 * القائمة تُعرض بلا مجموع تراكمي في الواجهة — حفاظاً على العدّ الأعمى.
 */
export async function listShiftOrders(): Promise<ShiftOrder[] | { error: string }> {
  try {
    const u = await requirePermission("sell");
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { error: "لا يوجد فرع فعّال" };
    const shift = await getOpenShift(branchId);
    if (!shift) return { error: "لا توجد وردية مفتوحة" };

    const rows = (await db()`
      select o.order_number, o.created_at, o.fulfillment, o.total,
             p.method, p.change,
             coalesce(json_agg(
               json_build_object('name', pr.name, 'qty', oi.qty, 'unit_price', oi.unit_price)
               order by oi.created_at
             ) filter (where oi.id is not null), '[]') as lines
      from orders o
      join order_items oi on oi.order_id = o.id
      join products pr on pr.id = oi.product_id
      left join payments p on p.order_id = o.id
      where o.shift_id = ${shift.id} and o.status = 'COMPLETED'
      group by o.id, o.order_number, o.created_at, o.fulfillment, o.total, p.method, p.change
      order by o.order_number desc
    `) as {
      order_number: number; created_at: string; fulfillment: "takeaway" | "dine_in";
      total: number; method: "cash" | "card" | null; change: number | null; lines: ShiftOrderLine[];
    }[];

    return rows.map((r) => ({
      orderNumber: r.order_number,
      at: r.created_at,
      fulfillment: r.fulfillment,
      method: r.method,
      total: Number(r.total),
      change: r.change == null ? null : Number(r.change),
      lines: r.lines.map((l) => ({ name: l.name, qty: Number(l.qty), unit_price: Number(l.unit_price) })),
    }));
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}
