"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";

/** القفل الطارئ للكاشير (يدوي فقط — لا قفل تلقائي). */
export async function setPosLockAction(
  locked: boolean
): Promise<{ ok: true; locked: boolean } | { ok: false; error: string }> {
  try {
    const u = await requirePermission(locked ? "lock_pos" : "unlock_pos");
    const b = await getActiveBranch(u.bid);
    if (!b) return { ok: false, error: "لا يوجد فرع فعّال" };
    await db()`update branches set pos_locked = ${locked} where id = ${b.id}`;
    try {
      await db()`
        insert into audit_log (business_id, branch_id, user_id, action, entity_type, reason)
        values (${u.bid}, ${b.id}, ${u.uid}, ${locked ? "pos_lock" : "pos_unlock"}, 'branch',
                ${locked ? "قفل الكاشير" : "فتح الكاشير"})
      `;
    } catch {
      /* لا يُفشل */
    }
    return { ok: true, locked };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }
}
