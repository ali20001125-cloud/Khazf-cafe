"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

export type MenuPatch = { id: string; menu_visible?: boolean; menu_note?: string };

/**
 * ما يُعرض على الزبون وما يُقال تحته.
 *
 * لا سعر هنا ولا وصفة: السعر بيته `product_crops` ويُعدَّل من «المنتجات»،
 * وإعدادٌ بمكانين يعني أن المالك قد يغيّر واحداً ويقرأ النظام الآخر.
 */
export async function updateMenuAction(
  patches: MenuPatch[]
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const clean = patches.filter((p) => p.id);
  if (clean.length === 0) return { ok: false, error: "لا تغييرات" };

  try {
    for (const p of clean) {
      if (typeof p.menu_visible === "boolean") {
        await db()`
          update products set menu_visible = ${p.menu_visible}
          where id = ${p.id} and business_id = ${user.bid}
        `;
      }
      if (typeof p.menu_note === "string") {
        // سطرٌ فارغ يعني «لا سطر»، لا سطراً من فراغ
        const note = p.menu_note.trim().slice(0, 160);
        await db()`
          update products set menu_note = ${note.length > 0 ? note : null}
          where id = ${p.id} and business_id = ${user.bid}
        `;
      }
    }
    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, reason)
      values (${user.bid}, ${user.uid}, 'menu_change', 'product',
              ${`تعديل منيو ${clean.length} منتجاً`})
    `;
    revalidatePath("/menu");
    revalidatePath("/manage/menu");
    return { ok: true, saved: clean.length };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}
