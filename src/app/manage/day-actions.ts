"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { closeDay } from "@/lib/day";

export async function closeDayAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const u = await requirePermission("day_close");
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false, error: "لا يوجد فرع فعّال" };
    const res = await closeDay(branchId, u.uid);
    if (!res.ok) return res;
    try {
      await db()`
        insert into audit_log (business_id, branch_id, user_id, action, entity_type, reason)
        values (${u.bid}, ${branchId}, ${u.uid}, 'day_close', 'day', 'إغلاق اليوم')
      `;
    } catch {
      /* لا يُفشل */
    }
    return { ok: true };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }
}
