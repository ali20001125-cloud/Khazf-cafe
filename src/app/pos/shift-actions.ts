"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { getOpenShift, openShift, closeShift, cashDrop } from "@/lib/shifts";
import { getSettings, numSetting } from "@/lib/settings";
import { can } from "@/lib/permissions";
import type { Permission } from "@/lib/permissions";
import type { SessionData } from "@/lib/session";

type Ok = { ok: true };
type Err = { ok: false; error: string };

async function withPerm<T>(perm: Permission, fn: (u: SessionData) => Promise<T>): Promise<T | Err> {
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

/**
 * فتح وردية.
 *
 * **الفكّة يحدّدها المالك، لا الباريستا.** إخفاء الحقل في الواجهة ليس
 * حماية (§66): من لا يملك `settings.manage` يُتجاهَل الرقم الذي أرسله
 * ويُستعمل القياسي من الإعدادات — حتى لو نادى الدالة بطلب مباشر.
 *
 * لماذا يهمّ: لو رفع الباريستا الفكّة ابتلع فرقاً، ولو خفّضها أظهر زيادة
 * وهمية. الرقم الذي يُقاس عليه الدرج لا يضعه من يُحاسَب عليه.
 */
export async function openShiftAction(openingFloat: number): Promise<Ok | Err> {
  return withPerm("cash.open_shift", async (u) => {
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };

    const settings = await getSettings();
    const standard = numSetting(settings, "standard_float", 50000);
    const mayChoose = await can(u, "settings.manage");

    const amount = mayChoose ? Math.round(openingFloat) : standard;
    if (!Number.isFinite(amount) || amount < 0) return { ok: false as const, error: "فكّة غير صالحة" };

    const res = await openShift(u.bid, branchId, u.uid, amount);
    if (!res.ok) return { ok: false as const, error: res.error };
    await audit(u.bid, branchId, u.uid, "open_shift",
      mayChoose ? `فكّة ${amount}` : `فكّة قياسية ${amount}`);
    return { ok: true as const };
  });
}

/** إغلاق أعمى: يُعيد {ok} فقط — لا يكشف المتوقّع/الفرق للباريستا. */
export async function closeShiftAction(countedCash: number): Promise<Ok | Err> {
  return withPerm("cash.close_shift", async (u) => {
    if (!Number.isFinite(countedCash) || countedCash < 0) return { ok: false as const, error: "المبلغ غير صالح" };
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };
    const shift = await getOpenShift(branchId);
    if (!shift) return { ok: false as const, error: "لا توجد وردية مفتوحة" };
    const res = await closeShift(shift.id, Math.round(countedCash));
    if (!res.ok) return { ok: false as const, error: res.error };
    // الدالة نفسها تكتب سطر التدقيق بالمتوقّع والفرق — لا يمرّان من هنا.
    return { ok: true as const };
  });
}

export async function cashDropAction(amount: number, reason: string): Promise<Ok | Err> {
  return withPerm("cash.drop", async (u) => {
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

// ── §28 فتح الدرج بلا بيع ────────────────────────────────────────────
/**
 * فتح الدرج بلا طلب حدث مسجَّل باسم وسبب ووقت — لا وسيلة صامتة لسحب المال.
 * صلاحية المالك (`cash.no_sale_open`): الباريستا لا يفتح الدرج بلا بيع.
 */
export async function noSaleOpenAction(reason: string): Promise<Ok | Err> {
  return withPerm("cash.no_sale_open", async (u) => {
    if (!reason.trim()) return { ok: false as const, error: "فتح الدرج يحتاج سبباً" };
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };
    const shift = await getOpenShift(branchId);

    await db()`
      insert into no_sale_opens (business_id, branch_id, shift_id, user_id, reason)
      values (${u.bid}, ${branchId}, ${shift?.id ?? null}, ${u.uid}, ${reason.trim()})
    `;
    await audit(u.bid, branchId, u.uid, "no_sale_open", reason.trim());
    return { ok: true as const };
  });
}

// ── §27 تسليم الدرج ──────────────────────────────────────────────────
export type StaffOption = { id: string; name: string };

/** زملاء الوردية الذين يمكن تسليم الدرج إليهم. */
export async function listHandoverTargets(): Promise<StaffOption[] | Err> {
  return withPerm("cash.handover", async (u) => {
    return (await db()`
      select id, name from users
      where business_id = ${u.bid} and active and id <> ${u.uid}
      order by name
    `) as StaffOption[];
  });
}

/**
 * يبدأ تسليم الدرج: المُسلِّم يعدّ النقد ويُدخل المجموع.
 * **عدّ أعمى أيضاً** — لا يُعاد له متوقّع ولا فرق. التأكيد من المُستلِم،
 * وعنده تنتقل مسؤولية الدرج (مُشغّل في القاعدة).
 */
export async function startHandoverAction(toUserId: string, countedCash: number): Promise<Ok | Err> {
  return withPerm("cash.handover", async (u) => {
    if (!toUserId) return { ok: false as const, error: "اختر من يستلم الدرج" };
    if (!Number.isFinite(countedCash) || countedCash < 0)
      return { ok: false as const, error: "المبلغ غير صالح" };

    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };
    const shift = await getOpenShift(branchId);
    if (!shift) return { ok: false as const, error: "لا توجد وردية مفتوحة" };

    try {
      await db()`
        insert into drawer_handovers (branch_id, shift_id, from_user_id, to_user_id, counted_cash,
                                      expected_cash, variance)
        values (${branchId}, ${shift.id}, ${u.uid}, ${toUserId}, ${Math.round(countedCash)},
                shift_expected_cash(${shift.id}),
                ${Math.round(countedCash)} - shift_expected_cash(${shift.id}))
      `;
    } catch {
      // الفهرس الفريد الجزئي: تسليم معلّق واحد لكل وردية
      return { ok: false as const, error: "يوجد تسليم معلّق بالفعل" };
    }
    await audit(u.bid, branchId, u.uid, "drawer_handover", "بدء تسليم الدرج");
    return { ok: true as const };
  });
}

/** المُستلِم يؤكّد — عندها فقط تنتقل مسؤولية الدرج. */
export async function confirmHandoverAction(handoverId: string): Promise<Ok | Err> {
  return withPerm("cash.handover", async (u) => {
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false as const, error: "لا يوجد فرع فعّال" };

    const rows = (await db()`
      update drawer_handovers
         set status = 'CONFIRMED', confirmed_at = now()
       where id = ${handoverId} and to_user_id = ${u.uid} and status = 'PENDING'
      returning id
    `) as { id: string }[];
    if (!rows[0]) return { ok: false as const, error: "لا يوجد تسليم بانتظارك" };

    await audit(u.bid, branchId, u.uid, "drawer_handover", "تأكيد استلام الدرج");
    return { ok: true as const };
  });
}

/** تسليم معلّق ينتظر تأكيد المستخدم الحالي. */
export async function pendingHandoverForMe(): Promise<{ id: string; from_name: string } | null> {
  try {
    const u = await requirePermission("cash.handover");
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return null;
    const rows = (await db()`
      select h.id, f.name as from_name
      from drawer_handovers h join users f on f.id = h.from_user_id
      where h.branch_id = ${branchId} and h.to_user_id = ${u.uid} and h.status = 'PENDING'
      order by h.created_at desc limit 1
    `) as { id: string; from_name: string }[];
    return rows[0] ?? null;
  } catch {
    return null;
  }
}
