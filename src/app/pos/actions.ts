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
  /**
   * كود خصمٍ يُستهلك مع البيع.
   *
   * **لا يُقبل في البيع المؤجَّل** (الذي تمّ بلا إنترنت ورُفع لاحقاً):
   * سقف الكود يُحجَز لحظةَ البيع، وبيعٌ وقع أمس بلا شبكة قد يكون
   * الكود نفد بينهما. فالخصم يُطبَّق متّصلاً أو لا يُطبَّق.
   */
  promoCode?: string | null;
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

    /*
     * الكود يُستهلك **قبل** البيع لا بعده.
     *
     * والسبب اتّجاه الفشل: لو بِيع أوّلاً ثمّ فشل الحجز لخرج الخصم من
     * الدرج بكودٍ نفد — مالٌ ضاع. ولو حُجز أوّلاً ثمّ فشل البيع لضاع
     * استعمالٌ واحد من الكود، ونحن نُعيده في `catch` أدناه.
     */
    let discountJson: string | null = null;
    let promoId: string | null = null;
    let promoDiscount = 0;

    if (input.promoCode && !input.occurredAt) {
      const subtotal = await cartSubtotal(user.bid, input.items);
      const red = (await db()`
        select promo_redeem(${user.bid}, ${input.promoCode}, ${subtotal},
                            ${null}::uuid, ${user.uid}) as r
      `) as { r: { ok: boolean; why?: string; promo_id?: string; discount?: number } }[];
      const r = red[0]?.r;
      if (!r?.ok) return { ok: false, error: r?.why ?? "كود غير صالح" };
      promoId = r.promo_id ?? null;
      promoDiscount = Number(r.discount ?? 0);
      discountJson = JSON.stringify({
        kind: "AMOUNT",
        value: promoDiscount,
        reason: `كود ${input.promoCode}`,
      });
    }

    let rows;
    try {
      rows = (await db()`
        select checkout(
          ${user.bid}, ${branchId}, ${user.uid}, ${shiftId},
          ${input.fulfillment}, ${input.method}, ${input.tendered},
          ${input.idempotencyKey}, ${itemsJson}::jsonb,
          ${input.customerId ?? null}, ${discountJson}::jsonb,
          ${input.occurredAt ?? null}::timestamptz
        ) as result
      `) as { result: { order_number: number; total: number; change: number | null; replay: boolean; order_id?: string } }[];
    } catch (err) {
      // فشل البيع بعد أن حُجز الكود: يُعاد الاستعمال، وإلّا ضاع من
      // سقفٍ محدود بسبب عطلٍ لا ذنب للزبون فيه
      if (promoId) await releasePromo(promoId);
      throw err;
    }

    const r = rows[0].result;

    // ربط الاستعمال بالطلب: بدونه يُعرف أن الكود استُعمل ولا يُعرف على
    // أيّ فاتورة — فلا تُراجَع حادثة
    if (promoId && r.order_id) {
      await db()`
        update promo_uses set order_id = ${r.order_id}
        where promo_id = ${promoId} and order_id is null
          and created_at > now() - interval '1 minute'
      `.catch(() => {});
    }

    return { ok: true, orderNumber: r.order_number, total: r.total, change: r.change, replay: r.replay };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر إتمام الدفع";
    // رسائل القاعدة عربية أصلاً (raise exception)
    return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
  }
}

/**
 * مجموع السلّة من **أسعار القاعدة** لا من المتصفّح.
 *
 * الكود يُحسب على هذا المجموع، ومتصفّحٌ يرسل مجموعاً من عنده يجعل
 * «٢٠٪» خصماً على رقمٍ اخترعه هو. والقاعدة وحدها تعرف السعر.
 */
async function cartSubtotal(businessId: string, items: PayItem[]): Promise<number> {
  const ids = items.map((i) => i.product_id);
  const crops = items.map((i) => i.crop_material_id);
  const rows = (await db()`
    select pc.product_id, pc.material_id, pc.price
    from product_crops pc
    join products p on p.id = pc.product_id
    where p.business_id = ${businessId}
      and pc.product_id = any(${ids}::uuid[])
      and pc.material_id = any(${crops}::uuid[])
  `) as { product_id: string; material_id: string; price: number }[];

  let sum = 0;
  for (const it of items) {
    const row = rows.find(
      (r) => r.product_id === it.product_id && r.material_id === it.crop_material_id
    );
    sum += Number(row?.price ?? 0) * Math.max(0, Math.trunc(it.qty));
  }
  return sum;
}

/** إعادة استعمالٍ حُجز ثمّ فشل بيعه. */
async function releasePromo(promoId: string): Promise<void> {
  try {
    await db()`
      update promo_codes set used_count = greatest(0, used_count - 1) where id = ${promoId}
    `;
    await db()`
      delete from promo_uses
      where promo_id = ${promoId} and order_id is null
        and created_at > now() - interval '1 minute'
    `;
  } catch {
    /* الأثر سقفٌ ناقصٌ بواحد — أهون من بيعٍ يفشل مرّتين */
  }
}
