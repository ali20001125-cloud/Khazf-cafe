"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import { getSettings, numSetting } from "@/lib/settings";
import { verifyOwnerPin } from "@/lib/approvals";

export type StaffResult =
  | { ok: true; orderNumber: number }
  | { ok: false; needsApproval: true }
  | { ok: false; needsApproval?: false; error: string };

export async function recordStaffDrinkAction(
  productId: string,
  cropMaterialId: string,
  fulfillment: "takeaway" | "dine_in",
  approvalPin?: string
): Promise<StaffResult> {
  let user;
  try {
    user = await requirePermission("staff_drink");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  try {
    const branch = await getActiveBranch(user.bid);
    if (!branch) return { ok: false, error: "لا يوجد فرع فعّال" };
    if (branch.pos_locked) return { ok: false, error: "الكاشير مقفل" };
    const shift = await getOpenShift(branch.id);
    if (!shift) return { ok: false, error: "افتح الوردية أولاً" };

    const settings = await getSettings();
    const limit = numSetting(settings, "staff_drink_limit", 1);

    const cnt = (await db()`
      select count(*)::int as n from orders
      where shift_id = ${shift.id} and is_staff and employee_id = ${user.uid} and status = 'COMPLETED'
    `) as { n: number }[];
    const used = cnt[0]?.n ?? 0;

    let approvedBy: string | null = null;
    if (used >= limit) {
      // تجاوز الحدّ — يحتاج موافقة المالك
      if (!approvalPin) return { ok: false, needsApproval: true };
      approvedBy = await verifyOwnerPin(user.bid, approvalPin);
      if (!approvedBy) return { ok: false, error: "رمز المالك غير صحيح" };
    }

    const rows = (await db()`
      select staff_drink(${user.bid}, ${branch.id}, ${user.uid}, ${shift.id},
        ${productId}, ${cropMaterialId}, ${fulfillment}, ${approvedBy}) as r
    `) as { r: { order_number: number } }[];

    return { ok: true, orderNumber: rows[0].r.order_number };
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "تعذّر التسجيل";
    return { ok: false, error: msg };
  }
}
