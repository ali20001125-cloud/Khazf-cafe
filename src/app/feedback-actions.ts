"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/throttle";
import { requirePermission, AuthError } from "@/lib/permissions";
import { soleBusinessId } from "@/lib/menu";

/**
 * إرسال رأيٍ من المنيو.
 *
 * **نقطة عامّة بلا جلسة** — كأيّ زبونٍ يمسح الرمز. ولذلك حدٌّ صارم:
 * نموذجٌ مفتوحٌ للعموم بلا حدّ هو صندوقٌ يُملأ آلياً في دقيقة، ويصير
 * بريد المالك لا يُقرأ.
 *
 * والحدّ على الجهاز لا على الرأي: خمسة آراء في الساعة من هاتفٍ واحد
 * تكفي أيّ زبونٍ صادق، ولا تكفي من يُغرق.
 */

const MAX_NOTE = 500;

export async function sendFeedbackAction(input: {
  rating: number | null;
  note: string;
  productId: string | null;
  phone: string;
  deviceKey: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const device = input.deviceKey.slice(0, 64);
  if (!device) return { ok: false, error: "تعذّر الإرسال" };
  // `.ok` لا الكائن نفسه: `rateLimit` تُرجع نتيجةً لا منطقاً، وكائنٌ
  // دائماً صادق. كُتبت هنا `if (!rateLimit(...))` فكان الحدّ موجوداً
  // في الكود معدوماً في العمل — مرّت ستّ محاولات والحدّ خمس. (ظهر في
  // الاختبار، لا في القراءة.)
  const gate = rateLimit(`fb:${device}`, 5, 3600);
  if (!gate.ok)
    return { ok: false, error: "شكراً — وصلتنا آراؤك. جرّب بعد قليل." };

  const rating =
    input.rating !== null && Number.isInteger(input.rating) &&
    input.rating >= 1 && input.rating <= 5
      ? input.rating
      : null;
  const note = input.note.trim().slice(0, MAX_NOTE);
  // الحارس نفسه الذي في القاعدة، هنا برسالةٍ مفهومة بدل خطأ قاعدة
  if (rating === null && note.length === 0)
    return { ok: false, error: "اكتب كلمة أو اختر تقييماً" };

  // الهاتف اختياريّ ولا يُشترط: اشتراطه يُسكت أكثر ممّا يُنطق
  const phone = input.phone.replace(/\D/g, "").slice(0, 15);

  const bid = await soleBusinessId();
  if (!bid) return { ok: false, error: "تعذّر الإرسال" };

  try {
    // المنتج يُتحقَّق قبل أن يُكتب: المعرّف يأتي من المتصفّح، ومعرّفٌ
    // من عملٍ آخر لا يُربط. والمجهول يُهمَل ولا يُفشل الرأي — الكلام
    // أهمّ من المشروب الذي عُلّق عليه.
    let productId: string | null = null;
    if (input.productId) {
      const own = (await db()`
        select id from products where id = ${input.productId} and business_id = ${bid}
      `) as { id: string }[];
      productId = own[0]?.id ?? null;
    }

    await db()`
      insert into feedback (business_id, rating, note, product_id, phone)
      values (${bid}, ${rating}, ${note.length > 0 ? note : null},
              ${productId}, ${phone.length >= 10 ? phone : null})
    `;
    revalidatePath("/manage/feedback");
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الإرسال" };
  }
}

/** المالك يعلّم ما قرأه — فلا يقرأ الشيء مرّتين ولا يفوته شيء. */
export async function markFeedbackReadAction(
  ids: string[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("reports.view");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }
  if (ids.length === 0) return { ok: false, error: "لا شيء" };

  try {
    await db()`
      update feedback set read_at = now()
      where id = any(${ids}::uuid[]) and business_id = ${user.bid} and read_at is null
    `;
    revalidatePath("/manage/feedback");
    revalidatePath("/manage");
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}
