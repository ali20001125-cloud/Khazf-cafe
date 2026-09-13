"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";

export type PayItem = { product_id: string; crop_material_id: string; qty: number; options?: string[] };

export type PayInput = {
  items: PayItem[];
  fulfillment: "takeaway" | "dine_in";
  method: "cash" | "card";
  tendered: number | null;
  idempotencyKey: string;
  /** حساب ولاء مربوط بالفاتورة (§38). الأختام تُحتسب في نفس معاملة البيع (§59). */
  customerId?: string | null;
  /**
   * لحظة البيع الحقيقية (ISO) — تُمرَّر للفواتير التي تمّت بلا إنترنت ورُفعت
   * لاحقاً. بدونها يُكتب البيع بوقت **الرفع**، فبيعُ ١١ ليلاً المرفوع ٨
   * صباحاً يقع في يوم محاسبي آخر ووردية أخرى: مبيعات ليلة أمس تنتقل إلى
   * اليوم، ونقدُه يظهر في درج وردية لم تقبضه (هجرة 0025).
   */
  occurredAt?: string | null;
  /** وردية البيع — تُمرَّر للمرفوع لاحقاً لأن المفتوحة الآن قد تكون غيرها. */
  shiftId?: string | null;
};

export type PayResult =
  | { ok: true; orderNumber: number; total: number; change: number | null; replay: boolean }
  | { ok: false; error: string };

export async function pay(input: PayInput): Promise<PayResult> {
  let user;
  try {
    user = await requirePermission("orders.create");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!input.items?.length) return { ok: false, error: "الطلب فارغ" };
  if (input.method === "cash" && (input.tendered == null || input.tendered < 0))
    return { ok: false, error: "أدخل المبلغ المدفوع" };
  if (!input.idempotencyKey) return { ok: false, error: "مفتاح دفع مفقود" };

  try {
    const branch = await getActiveBranch(user.bid);
    if (!branch) return { ok: false, error: "لا يوجد فرع فعّال" };
    if (branch.pos_locked) return { ok: false, error: "الكاشير مقفل من قبل المالك" };
    const branchId = branch.id;

    // كل بيع ينتمي لوردية (لتسوية الكاش وكشف النقص). البيع المرفوع لاحقاً
    // يحمل ورديته معه: قد تكون أُغلقت، وهو مع ذلك وقع فيها.
    let shiftId = input.shiftId ?? null;
    if (!shiftId) {
      const shift = await getOpenShift(branchId);
      if (!shift) return { ok: false, error: "افتح الوردية أولاً" };
      shiftId = shift.id;
    }

    const itemsJson = JSON.stringify(
      input.items.map((i) => ({
        product_id: i.product_id,
        crop_material_id: i.crop_material_id,
        qty: i.qty,
        options: i.options ?? [],
      }))
    );

    // النسخة ذات ١١ وسيطاً: تربط العميل وتترك الخصم فارغاً (الخصم شاشة مستقلّة).
    const rows = (await db()`
      select checkout(
        ${user.bid}, ${branchId}, ${user.uid}, ${shiftId},
        ${input.fulfillment}, ${input.method}, ${input.tendered},
        ${input.idempotencyKey}, ${itemsJson}::jsonb,
        ${input.customerId ?? null}, ${null}::jsonb,
        ${input.occurredAt ?? null}::timestamptz
      ) as result
    `) as { result: { order_number: number; total: number; change: number | null; replay: boolean } }[];

    const r = rows[0].result;
    return { ok: true, orderNumber: r.order_number, total: r.total, change: r.change, replay: r.replay };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر إتمام الدفع";
    // رسائل القاعدة عربية أصلاً (raise exception)
    return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
  }
}
