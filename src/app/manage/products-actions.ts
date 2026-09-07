"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

export type ProductPatch = {
  paused?: boolean;
  active?: boolean;
  coffee_grams?: number;
  crops?: { id: string; price: number }[];
  items?: { id: string; qty: number }[];
};

export async function updateProductAction(
  productId: string,
  patch: ProductPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  try {
    // تأكيد أن المشروب يخصّ هذا العمل
    const owns = (await db()`
      select 1 from products where id = ${productId} and business_id = ${user.bid}
    `) as unknown[];
    if (owns.length === 0) return { ok: false, error: "مشروب غير موجود" };

    if (typeof patch.paused === "boolean") {
      await db()`update products set paused = ${patch.paused} where id = ${productId}`;
    }
    if (typeof patch.active === "boolean") {
      await db()`update products set active = ${patch.active} where id = ${productId}`;
    }

    if (typeof patch.coffee_grams === "number" && patch.coffee_grams >= 0) {
      await db()`
        update recipes set coffee_grams = ${Math.round(patch.coffee_grams)}
        where product_id = ${productId} and active
      `;
    }

    for (const c of patch.crops ?? []) {
      if (!(c.price >= 0)) continue;
      await db()`
        update product_crops pc set price = ${Math.round(c.price)}
        from products p
        where pc.id = ${c.id} and pc.product_id = p.id
          and p.id = ${productId} and p.business_id = ${user.bid}
      `;
    }

    for (const it of patch.items ?? []) {
      if (!(it.qty > 0)) continue;
      await db()`
        update recipe_items ri set qty = ${Math.round(it.qty)}
        from recipes r, products p
        where ri.id = ${it.id} and ri.recipe_id = r.id and r.product_id = p.id
          and p.id = ${productId} and p.business_id = ${user.bid}
      `;
    }

    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, entity_id, reason)
      values (${user.bid}, ${user.uid}, 'price_recipe_change', 'product', ${productId}, 'تعديل منتج/سعر/وصفة')
    `;
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}
