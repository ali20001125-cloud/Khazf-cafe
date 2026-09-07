"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import { verifyOwnerPin } from "@/lib/approvals";

/**
 * الإلغاء والإرجاع (المواصفة §49 · §50).
 *
 * ثلاث قواعد تحكم هذا الملفّ:
 * 1. **لا حذف**: الطلب الأصلي يبقى كما هو، وتُضاف فوقه وثيقة.
 * 2. **موافقة صريحة**: كل عملية تطلب رمز المالك ولو نفّذها المالك نفسه —
 *    فالرمز هو ما يثبت الحضور، لا الجلسة المفتوحة على جهاز في الكاونتر.
 * 3. **الإرجاع لا يُعيد المواد** لمشروبات الكافيه (استُهلكت فعلاً).
 *
 * سقف الإرجاع وحالة الطلب وحركة الكاش كلها يفرضها مُشغّل في القاعدة —
 * هذا الملفّ يجمع المدخلات ويوثّق من وافق.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

// ── §49 إلغاء طلب مدفوع ─────────────────────────────────────────────
export async function voidOrder(
  orderId: string,
  reason: string,
  ownerPin: string,
  /**
   * هل أُعيد المال للزبون؟ سؤال إلزامي لا يُستنتج (هجرة 0021):
   * نعم ← يُنقص الدرج المتوقّع فلا يظهر نقص كاذب.
   * لا  ← المال يجب أن يبقى في الدرج، وغيابه نقص حقيقي بلا عذر.
   */
  cashReturned: boolean
): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("payments.void");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!reason.trim()) return { ok: false, error: "الإلغاء يحتاج سبباً" };

  const approvedBy = await verifyOwnerPin(user.bid, ownerPin);
  if (!approvedBy) return { ok: false, error: "رمز المالك غير صحيح" };

  try {
    const branch = await getActiveBranch(user.bid);
    if (!branch) return { ok: false, error: "لا يوجد فرع فعّال" };

    const rows = (await db()`
      select id, status::text as status, order_number, total
      from orders where id = ${orderId} and branch_id = ${branch.id}
    `) as { id: string; status: string; order_number: number; total: number }[];
    const order = rows[0];
    if (!order) return { ok: false, error: "الطلب غير موجود" };
    if (["VOIDED", "REFUNDED", "CANCELLED"].includes(order.status))
      return { ok: false, error: `الطلب ${order.status} بالفعل` };

    await db()`
      insert into order_voids (order_id, reason, voided_by, approved_by, cash_returned)
      values (${orderId}, ${reason.trim()}, ${user.uid}, ${approvedBy}, ${cashReturned})
    `;
    // مُشغّل آلة الحالة في القاعدة يرفض أي انتقال غير مسموح
    await db()`update orders set status = 'VOIDED' where id = ${orderId}`;

    await db()`
      insert into audit_log (business_id, branch_id, user_id, approved_by, action,
                             entity_type, entity_id, before, after, reason)
      values (${user.bid}, ${branch.id}, ${user.uid}, ${approvedBy}, 'order_voided',
              'order', ${orderId},
              ${JSON.stringify({ status: order.status, total: order.total })}::jsonb,
              ${JSON.stringify({ status: "VOIDED", cash_returned: cashReturned })}::jsonb,
              ${reason.trim()})
    `;

    revalidatePath("/manage/orders");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر الإلغاء";
    return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
  }
}

// ── §50 إرجاع مبلغ ───────────────────────────────────────────────────
export type RefundInput = {
  orderId: string;
  amount: number;
  method: "cash" | "card";
  reason: string;
  ownerPin: string;
  idempotencyKey: string;
};

export async function refundOrder(input: RefundInput): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("payments.refund");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!input.reason.trim()) return { ok: false, error: "الإرجاع يحتاج سبباً" };
  if (!Number.isInteger(input.amount) || input.amount <= 0)
    return { ok: false, error: "مبلغ غير صالح" };
  if (!input.idempotencyKey) return { ok: false, error: "مفتاح إرجاع مفقود" };

  const approvedBy = await verifyOwnerPin(user.bid, input.ownerPin);
  if (!approvedBy) return { ok: false, error: "رمز المالك غير صحيح" };

  try {
    const branch = await getActiveBranch(user.bid);
    if (!branch) return { ok: false, error: "لا يوجد فرع فعّال" };

    const rows = (await db()`
      select id, status::text as status from orders
      where id = ${input.orderId} and branch_id = ${branch.id}
    `) as { id: string; status: string }[];
    if (!rows[0]) return { ok: false, error: "الطلب غير موجود" };
    if (["VOIDED", "CANCELLED"].includes(rows[0].status))
      return { ok: false, error: "لا يُرجَع طلب ملغى" };

    // الإرجاع النقدي يخرج من درج الوردية المفتوحة (حركة سالبة يكتبها المُشغّل)
    const shift = input.method === "cash" ? await getOpenShift(branch.id) : null;
    if (input.method === "cash" && !shift)
      return { ok: false, error: "الإرجاع النقدي يحتاج وردية مفتوحة" };

    // COMPLETED مباشرة: الموافقة تمّت بالرمز أعلاه.
    // المُشغّل يفرض السقف (≤ المدفوع) وينقل حالة الطلب ويكتب حركة الكاش.
    await db()`
      insert into refunds (business_id, branch_id, order_id, shift_id, amount, method,
                           reason, requested_by, approved_by, status, idempotency_key, completed_at)
      values (${user.bid}, ${branch.id}, ${input.orderId}, ${shift?.id ?? null},
              ${input.amount}, ${input.method}, ${input.reason.trim()},
              ${user.uid}, ${approvedBy}, 'COMPLETED', ${input.idempotencyKey}, now())
    `;

    await db()`
      insert into audit_log (business_id, branch_id, user_id, approved_by, action,
                             entity_type, entity_id, after, reason)
      values (${user.bid}, ${branch.id}, ${user.uid}, ${approvedBy}, 'refund_created',
              'order', ${input.orderId},
              ${JSON.stringify({ amount: input.amount, method: input.method })}::jsonb,
              ${input.reason.trim()})
    `;

    revalidatePath("/manage/orders");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر الإرجاع";
    // القاعدة ترفع رسالة عربية لتجاوز السقف أو تكرار المفتاح
    if (msg.includes("duplicate key") || msg.includes("idempotency"))
      return { ok: false, error: "هذا الإرجاع مسجَّل بالفعل" };
    return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
  }
}
