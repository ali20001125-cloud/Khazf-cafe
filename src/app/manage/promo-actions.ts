"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

/**
 * إنشاء كود خصم وإيقافه.
 *
 * **صلاحية المالك وحدها** (`settings.manage`) لا صلاحية الخصم: من
 * يملك تطبيق خصمٍ على فاتورة لا يملك أن يصنع كوداً يخصم على مئة.
 *
 * والحرّاس هنا فوق حرّاس القاعدة لا بدلاً منها: القاعدة تردّ نسبةً
 * فوق الخمسين وسقفاً صفراً وتاريخاً ماضياً — وهذه تردّها برسالةٍ
 * تُقرأ، فلا يرى المالك خطأ قاعدة.
 */

export async function createPromoAction(input: {
  code: string;
  kind: "percent" | "amount";
  value: number;
  minTotal: number;
  maxDiscount: number | null;
  maxUses: number;
  days: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("settings.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  // الحروف والأرقام واللاتينية وحدها: كودٌ فيه فراغٌ أو رمزٌ يُكتب
  // غلطاً على هاتفٍ ولا يُقبل، فيقف الزبون عند الكاونتر
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,20}$/.test(code))
    return { ok: false, error: "الكود: حروف إنجليزية وأرقام، من ٣ إلى ٢٠" };

  const value = Math.trunc(Number(input.value));
  if (input.kind === "percent" && !(value >= 1 && value <= 50))
    return { ok: false, error: "النسبة بين ١ و ٥٠٪ — وما فوق النصف خطأ كتابةٍ في الغالب" };
  if (input.kind === "amount" && !(value >= 1 && value <= 1_000_000))
    return { ok: false, error: "مبلغ غير صالح" };

  const maxUses = Math.trunc(Number(input.maxUses));
  if (!(maxUses >= 1 && maxUses <= 100_000))
    return { ok: false, error: "عدد المرّات بين ١ و ١٠٠٬٠٠٠ — والسقف مطلوب" };

  const days = Math.trunc(Number(input.days));
  if (!(days >= 1 && days <= 365))
    return { ok: false, error: "المدّة بين يومٍ وسنة — والانتهاء مطلوب" };

  const minTotal = Math.max(0, Math.trunc(Number(input.minTotal) || 0));
  const maxDiscount =
    input.maxDiscount === null || !(Number(input.maxDiscount) > 0)
      ? null
      : Math.trunc(Number(input.maxDiscount));

  try {
    const dup = (await db()`
      select 1 from promo_codes
      where business_id = ${user.bid} and upper(btrim(code)) = ${code}
    `) as unknown[];
    if (dup.length > 0) return { ok: false, error: "هذا الكود موجود" };

    await db()`
      insert into promo_codes
        (business_id, code, kind, value, min_total, max_discount,
         max_uses, expires_at, created_by)
      values
        (${user.bid}, ${code}, ${input.kind}::promo_kind, ${value},
         ${minTotal}, ${maxDiscount}, ${maxUses},
         now() + (${days} || ' days')::interval, ${user.uid})
    `;
    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, reason)
      values (${user.bid}, ${user.uid}, 'promo_create', 'promo',
              ${`كود ${code}: ${input.kind === "percent" ? `${value}٪` : value} · ${maxUses} مرّة · ${days} يوم`})
    `;
    revalidatePath("/manage/promos");
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الإنشاء" };
  }
}

/**
 * إيقاف كود — لا حذفه.
 *
 * الحذف يمحو معه سجلّ ما حُسم به (`on delete cascade`)، فيختفي المال
 * من التاريخ. والإيقاف يمنع الاستعمال ويُبقي الحساب.
 */
export async function stopPromoAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("settings.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }
  try {
    const rows = (await db()`
      update promo_codes set active = false
      where id = ${id} and business_id = ${user.bid} and active
      returning code
    `) as { code: string }[];
    if (!rows[0]) return { ok: false, error: "الكود موقوفٌ أصلاً" };

    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, reason)
      values (${user.bid}, ${user.uid}, 'promo_stop', 'promo', ${`أُوقف كود ${rows[0].code}`})
    `;
    revalidatePath("/manage/promos");
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الإيقاف" };
  }
}

/**
 * فحص كودٍ من الكاشير **دون استهلاكه** — لعرض الخصم قبل الدفع.
 *
 * والاستهلاك يقع في لحظة البيع وحدها (`promo_redeem` داخل معاملة
 * الدفع)، لا هنا: من فحص كوداً ثم عدل عن الشراء لا يجوز أن يُنقص
 * رصيده.
 */
export async function checkPromoAction(
  code: string,
  total: number
): Promise<
  { ok: true; discount: number; code: string } | { ok: false; error: string }
> {
  let user;
  try {
    user = await requirePermission("discounts.apply");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const c = code.trim().toUpperCase().slice(0, 20);
  if (c.length === 0) return { ok: false, error: "اكتب الكود" };
  if (!(Number.isFinite(total) && total > 0))
    return { ok: false, error: "السلّة فارغة" };

  try {
    const rows = (await db()`
      select promo_check(${user.bid}, ${c}, ${Math.trunc(total)}) as r
    `) as { r: { ok: boolean; why?: string; discount?: number; code?: string } }[];
    const r = rows[0]?.r;
    if (!r) return { ok: false, error: "تعذّر الفحص" };
    if (!r.ok) return { ok: false, error: r.why ?? "كود غير صالح" };
    return { ok: true, discount: Number(r.discount ?? 0), code: String(r.code ?? c) };
  } catch {
    return { ok: false, error: "تعذّر الفحص" };
  }
}
