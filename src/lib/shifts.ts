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

/** إغلاق أعمى: يُخزَّن المعدود والمتوقّع والفرق ذرّياً. لا يُعيد أرقاماً للباريستا. */
export async function closeShift(
  shiftId: string,
  countedCash: number
): Promise<{ ok: true; expected: number; variance: number } | { ok: false; error: string }> {
  const rows = (await db()`
    update shifts s
    set counted_cash = ${countedCash},
        expected_cash = s.opening_float + coalesce(
          (select sum(amount) from cash_movements where shift_id = s.id), 0),
        variance = ${countedCash} - (s.opening_float + coalesce(
          (select sum(amount) from cash_movements where shift_id = s.id), 0)),
        closed_at = now(),
        status = 'CLOSED'
    where s.id = ${shiftId} and s.status = 'OPEN'
    returning expected_cash, variance
  `) as { expected_cash: number; variance: number }[];
  if (!rows[0]) return { ok: false, error: "الوردية غير مفتوحة" };
  return { ok: true, expected: Number(rows[0].expected_cash), variance: Number(rows[0].variance) };
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
