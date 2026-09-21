"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

/**
 * تغيير أسعارٍ كثيرة دفعةً واحدة.
 *
 * **ما يُحفظ هو ما رآه المالك.** النسبة المئوية تُحسب في الشاشة ويُعرض
 * أثرها صفّاً صفّاً — «٣٬٠٠٠ ← ٣٬٣٠٠» — ثم تُرسل الأرقام النهائية. ولو
 * أُرسلت النسبة لتُحسب هنا لاحتمل أن يُضغط الحفظ مرّتين فتُرفع الأسعار
 * عشرين بالمئة، ولا يظهر ذلك إلّا في نهاية اليوم.
 *
 * والسطر الواحد في سجلّ التدقيق يحمل ما كان وما صار لكل صفّ: السعر
 * مالٌ، ومن غيّره ومتى وكم كان سؤالٌ يُسأل بعد شهر.
 */

export type PriceChange = { id: string; price: number };

const MAX_PRICE = 1_000_000;

export async function updatePricesAction(
  changes: PriceChange[]
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const clean = changes.filter((c) => c.id);
  if (clean.length === 0) return { ok: false, error: "لا تغييرات" };

  // سعرٌ سالب أو كسريّ أو خياليّ يُرَدّ قبل أن يُكتب — لا بعد
  for (const c of clean) {
    if (!Number.isFinite(c.price) || c.price < 0 || c.price > MAX_PRICE)
      return { ok: false, error: "سعر غير صالح" };
  }

  try {
    // القراءة قبل الكتابة: «ما كان» لا يُعرف بعد أن يُكتب فوقه
    const ids = clean.map((c) => c.id);
    const before = (await db()`
      select pc.id, pc.price, p.name as product_name
      from product_crops pc
      join products p on p.id = pc.product_id
      where pc.id = any(${ids}::uuid[]) and p.business_id = ${user.bid}
    `) as { id: string; price: number; product_name: string }[];

    // ما لا يخصّ هذا العمل لا يُكتب: المعرّفات تأتي من المتصفّح
    const mine = new Set(before.map((b) => b.id));
    const allowed = clean.filter((c) => mine.has(c.id));
    if (allowed.length === 0) return { ok: false, error: "لا شيء لتغييره" };

    for (const c of allowed) {
      await db()`
        update product_crops set price = ${Math.round(c.price)} where id = ${c.id}
      `;
    }

    const diff = allowed.map((c) => {
      const b = before.find((x) => x.id === c.id)!;
      return { name: b.product_name, from: Number(b.price), to: Math.round(c.price) };
    });

    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, before, after, reason)
      values (${user.bid}, ${user.uid}, 'bulk_price_change', 'product',
              ${JSON.stringify(diff.map((d) => ({ name: d.name, price: d.from })))}::jsonb,
              ${JSON.stringify(diff.map((d) => ({ name: d.name, price: d.to })))}::jsonb,
              ${`تعديل ${allowed.length} سعراً دفعةً واحدة`})
    `;

    revalidatePath("/manage/prices");
    revalidatePath("/manage/products");
    revalidatePath("/menu");
    revalidatePath("/pos");
    return { ok: true, saved: allowed.length };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}
