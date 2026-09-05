"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { getOpenShift, openShift, closeShift, cashDrop } from "@/lib/shifts";
import type { Permission } from "@/lib/permissions";

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function withPerm<T>(perm: Permission, fn: (u: { uid: string; bid: string }) => Promise<T>): Promise<T | Err> {
  try {
    const u = await requirePermission(perm);
    return await fn(u);
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }
}

async function audit(businessId: string, branchId: string | null, userId: string, action: string, reason: string | null) {
  try {
    await db()`
      insert into audit_log (business_id, branch_id, user_id, action, entity_type, reason)
      values (${businessId}, ${branchId}, ${userId}, ${action}, 'shift', ${reason})
    `;
  } catch {
    /* التدقيق لا يُفشل العملية */
  }
}

export async function openShiftAction(openingFloat: number): Promise<Ok | Err> {
  return withPerm("open_shift", async (u) => {
    if (!Number.isFinite(openingFloat) || openingFloat < 0) return { ok: false as const, error: "فكّة غير صالحة" };
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };
    const res = await openShift(u.bid, branchId, u.uid, Math.round(openingFloat));
    if (!res.ok) return { ok: false as const, error: res.error };
    await audit(u.bid, branchId, u.uid, "open_shift", `فكّة ${Math.round(openingFloat)}`);
    return { ok: true as const };
  });
}

/** إغلاق أعمى: يُعيد {ok} فقط — لا يكشف المتوقّع/الفرق للباريستا. */
export async function closeShiftAction(countedCash: number): Promise<Ok | Err> {
  return withPerm("close_shift", async (u) => {
    if (!Number.isFinite(countedCash) || countedCash < 0) return { ok: false as const, error: "المبلغ غير صالح" };
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };
    const shift = await getOpenShift(branchId);
    if (!shift) return { ok: false as const, error: "لا توجد وردية مفتوحة" };
    const res = await closeShift(shift.id, Math.round(countedCash));
    if (!res.ok) return { ok: false as const, error: res.error };
    // الفرق يُسجَّل للمالك، لا يُعرض للباريستا
    await audit(u.bid, branchId, u.uid, "close_shift", `فرق ${res.variance}`);
    return { ok: true as const };
  });
}

export async function cashDropAction(amount: number, reason: string): Promise<Ok | Err> {
  return withPerm("cash_drop", async (u) => {
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };
    const shift = await getOpenShift(branchId);
    if (!shift) return { ok: false as const, error: "لا توجد وردية مفتوحة" };
    const res = await cashDrop(shift.id, u.uid, Math.round(amount), reason);
    if (!res.ok) return { ok: false as const, error: res.error ?? "تعذّر السحب" };
    await audit(u.bid, branchId, u.uid, "cash_drop", `${Math.round(amount)} — ${reason || "سحب"}`);
    return { ok: true as const };
  });
}
