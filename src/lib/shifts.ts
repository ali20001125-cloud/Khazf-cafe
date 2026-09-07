import "server-only";
import { db } from "./db";

/**
 * الورديات والدرج (المواصفة §الوردية واليوم).
 * - المتوقّع = الفكّة + Σ(cash_movements.amount)  [SALE موجب · DROP/EXPENSE/REFUND سالب].
 * - الإغلاق بعدّ أعمى: الباريستا يُدخل المعدود دون رؤية المتوقّع؛ الفرق يُحسب ويُخزَّن.
 * - وردية مفتوحة واحدة لكل فرع (partial unique index يفرضها في القاعدة).
 */

export type OpenShift = {
  id: string;
  opening_float: number;
  opened_at: string;
  employee_name: string;
};

export async function getOpenShift(branchId: string): Promise<OpenShift | null> {
  const rows = (await db()`
    select s.id, s.opening_float, s.opened_at, u.name as employee_name
    from shifts s join users u on u.id = s.employee_id
    where s.branch_id = ${branchId} and s.status = 'OPEN'
    limit 1
  `) as OpenShift[];
  return rows[0] ?? null;
}

export async function openShift(
  businessId: string,
  branchId: string,
  employeeId: string,
  openingFloat: number
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const rows = (await db()`
      insert into shifts (business_id, branch_id, employee_id, drawer_owner_id, opening_float, status)
      values (${businessId}, ${branchId}, ${employeeId}, ${employeeId}, ${openingFloat}, 'OPEN')
      returning id
    `) as { id: string }[];
    return { ok: true, id: rows[0].id };
  } catch {
    // قيد الوردية المفتوحة الواحدة (partial unique) → موجودة أصلاً
    return { ok: false, error: "توجد وردية مفتوحة بالفعل" };
  }
}

/**
 * إغلاق أعمى — ينادي `close_shift_blind()` في القاعدة.
 *
 * الحساب **لا يُعاد هنا**: صيغة المتوقّع (الفكّة + Σ الحركات ما عدا OPENING)
 * تعيش في `shift_expected_cash()` وحدها، وإلا اختلفت نسختان بمرور الوقت.
 * الدالة تكتب المعدود ثم تحسب المتوقّع والفرق ذرّياً وتُسجّل في `audit_log`،
 * ولا تُعيد أي رقم مالي — الباريستا لا يرى الفرق (§26).
 */
export async function closeShift(
  shiftId: string,
  countedCash: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await db()`
      select close_shift_blind(${shiftId}, (select employee_id from shifts where id = ${shiftId}), ${countedCash})
    `;
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر إغلاق الوردية";
    return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
  }
}

/** سحب نقد أثناء الوردية (DROP) — يُنقص الدرج المتوقّع ويُسجَّل. */
export async function cashDrop(
  shiftId: string,
  userId: string,
  amount: number,
  reason: string
): Promise<{ ok: boolean; error?: string }> {
  if (amount <= 0) return { ok: false, error: "مبلغ غير صالح" };
  await db()`
    insert into cash_movements (shift_id, type, amount, reason, user_id)
    values (${shiftId}, 'DROP', ${-Math.abs(amount)}, ${reason || "سحب نقد"}, ${userId})
  `;
  return { ok: true };
}
