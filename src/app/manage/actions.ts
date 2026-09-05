"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError, type Permission } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { recordPurchase, applyStockCount, type CountItem, type CountResult } from "@/lib/inventory";

type Err = { ok: false; error: string };

async function branchOrErr(bid: string): Promise<string | Err> {
  const b = await getActiveBranchId(bid);
  return b ?? { ok: false, error: "لا يوجد فرع فعّال" };
}

async function audit(businessId: string, branchId: string, userId: string, action: string, reason: string) {
  try {
    await db()`
      insert into audit_log (business_id, branch_id, user_id, action, entity_type, reason)
      values (${businessId}, ${branchId}, ${userId}, ${action}, 'inventory', ${reason})
    `;
  } catch {
    /* لا يُفشل العملية */
  }
}

function guard<T extends unknown[], R>(perm: Permission, fn: (u: { uid: string; bid: string }, ...a: T) => Promise<R>) {
  return async (...args: T): Promise<R | Err> => {
    try {
      const u = await requirePermission(perm);
      return await fn(u, ...args);
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, error: e.message };
      const msg = e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "خطأ";
      return { ok: false, error: msg };
    }
  };
}

export const addStockAction = guard(
  "add_stock",
  async (u, materialId: string, qtyBase: number, unitCostBase: number, reason: string) => {
    if (!Number.isFinite(qtyBase) || qtyBase <= 0) return { ok: false as const, error: "كمية غير صالحة" };
    const b = await branchOrErr(u.bid);
    if (typeof b !== "string") return b;
    const newStock = await recordPurchase(u.bid, b, u.uid, materialId, Math.round(qtyBase), Math.round(unitCostBase || 0), reason);
    await audit(u.bid, b, u.uid, "add_stock", `+${Math.round(qtyBase)} (${reason || "شراء"})`);
    return { ok: true as const, newStock };
  }
);

export const stockCountAction = guard(
  "stock_count",
  async (u, counts: CountItem[]): Promise<{ ok: true; result: CountResult } | Err> => {
    if (!counts?.length) return { ok: false as const, error: "لا مواد في الجرد" };
    const b = await branchOrErr(u.bid);
    if (typeof b !== "string") return b;
    const result = await applyStockCount(u.bid, b, u.uid, counts);
    const flagged = result.items.filter((i) => i.variance !== 0).length;
    await audit(u.bid, b, u.uid, "stock_count", `جرد ${result.items.length} مادة · فروقات ${flagged}`);
    return { ok: true as const, result };
  }
);
