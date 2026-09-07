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

// =====================================================================
// إنشاء المشروبات والمحاصيل
// =====================================================================

/**
 * محصول قهوة جديد.
 *
 * المحصول **مادة في المخزون** أولاً وأخيراً: له رصيد وتكلفة ويُستهلك
 * بالغرام. لذلك إنشاؤه من هنا يعني إنشاء مادة، ثم ربطها بالمشروبات التي
 * تُباع منها. يبدأ برصيد صفر — يُملأ بشراء مسجّل، لا برقم يُكتب بيد أحد.
 */
export async function createCropAction(
  name: string,
  lowThresholdGrams: number
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const clean = name.trim();
  if (!clean) return { ok: false, error: "اكتب اسم المحصول" };

  try {
    const dup = (await db()`
      select 1 from materials where business_id = ${user.bid} and name = ${clean}
    `) as unknown[];
    if (dup.length) return { ok: false, error: "يوجد محصول بهذا الاسم" };

    const rows = (await db()`
      insert into materials (business_id, name, base_unit, low_threshold, current_cost, dose_grams)
      values (${user.bid}, ${clean}, 'g', ${Math.max(0, Math.round(lowThresholdGrams) || 0)}, 0, 18)
      returning id
    `) as { id: string }[];

    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, entity_id, reason)
      values (${user.bid}, ${user.uid}, 'product_changed', 'material', ${rows[0].id},
              ${"إنشاء محصول: " + clean})
    `;
    return { ok: true, id: rows[0].id };
  } catch {
    return { ok: false, error: "تعذّر إنشاء المحصول" };
  }
}

export type NewProduct = {
  name: string;
  category: string;
  /** غرامات الحبوب لكل كوب — تأتي من الوصفة لا من الباريستا. */
  coffeeGrams: number;
  /** مل الحليب (صفر للمشروبات بلا حليب). */
  milkMl: number;
  /** يخصم كوباً وغطاءً للسفري. */
  takeawayCup: boolean;
  /** المحاصيل المتاحة لهذا المشروب وسعر كل واحد. */
  crops: { materialId: string; price: number }[];
};

/**
 * مشروب جديد بوصفته ومحاصيله في عملية واحدة.
 *
 * لماذا معاً: مشروب بلا محصول لا يُباع، ومشروب بلا وصفة لا يخصم مخزوناً —
 * فإنشاؤه ناقصاً يترك صفّاً معطوباً في الكتالوج.
 */
export async function createProductAction(
  input: NewProduct
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "اكتب اسم المشروب" };
  if (!input.crops?.length) return { ok: false, error: "اختر محصولاً واحداً على الأقل" };
  if (input.crops.some((c) => !(c.price >= 0))) return { ok: false, error: "سعر غير صالح" };

  try {
    const dup = (await db()`
      select 1 from products where business_id = ${user.bid} and name = ${name} and active
    `) as unknown[];
    if (dup.length) return { ok: false, error: "يوجد مشروب بهذا الاسم" };

    const prod = (await db()`
      insert into products (business_id, name, category, sort)
      values (${user.bid}, ${name}, ${input.category || "other"},
              coalesce((select max(sort) + 10 from products where business_id = ${user.bid}), 10))
      returning id
    `) as { id: string }[];
    const productId = prod[0].id;

    for (const c of input.crops) {
      await db()`
        insert into product_crops (product_id, material_id, price, available)
        values (${productId}, ${c.materialId}, ${Math.round(c.price)}, true)
        on conflict (product_id, material_id) do nothing
      `;
    }

    const rec = (await db()`
      insert into recipes (product_id, version, coffee_grams, active)
      values (${productId}, 1, ${Math.max(0, Math.round(input.coffeeGrams) || 0)}, true)
      returning id
    `) as { id: string }[];
    const recipeId = rec[0].id;

    if (input.milkMl > 0) {
      await db()`
        insert into recipe_items (recipe_id, material_id, qty, only_takeaway)
        select ${recipeId}, id, ${Math.round(input.milkMl)}, false
        from materials where business_id = ${user.bid} and name = 'حليب' and active
        limit 1
      `;
    }

    if (input.takeawayCup) {
      await db()`
        insert into recipe_items (recipe_id, material_id, qty, only_takeaway)
        select ${recipeId}, id, 1, true
        from materials
        where business_id = ${user.bid} and active and name in ('كوب سفري', 'غطاء')
      `;
    }

    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, entity_id, reason)
      values (${user.bid}, ${user.uid}, 'product_changed', 'product', ${productId},
              ${"إنشاء مشروب: " + name})
    `;
    return { ok: true, id: productId };
  } catch {
    return { ok: false, error: "تعذّر إنشاء المشروب" };
  }
}

/** ربط محصول بمشروب قائم بسعره. */
export async function addCropToProductAction(
  productId: string,
  materialId: string,
  price: number
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }
  if (!(price >= 0)) return { ok: false, error: "سعر غير صالح" };

  try {
    const owns = (await db()`
      select 1 from products where id = ${productId} and business_id = ${user.bid}
    `) as unknown[];
    if (!owns.length) return { ok: false, error: "مشروب غير موجود" };

    await db()`
      insert into product_crops (product_id, material_id, price, available)
      values (${productId}, ${materialId}, ${Math.round(price)}, true)
      on conflict (product_id, material_id) do update set available = true, price = excluded.price
    `;
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر ربط المحصول" };
  }
}

/**
 * إيقاف محصول عن مشروب.
 *
 * لا يُحذف الصفّ: فواتير قديمة تشير إليه، وحذفه يكسر تاريخاً مدفوعاً.
 * يصير `available = false` فيختفي من شاشة البيع ويبقى ما بيع منه مقروءاً.
 */
export async function setCropAvailabilityAction(
  cropId: string,
  available: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  try {
    const rows = (await db()`
      update product_crops pc set available = ${available}
      from products p
      where pc.id = ${cropId} and pc.product_id = p.id and p.business_id = ${user.bid}
      returning pc.id
    `) as { id: string }[];
    if (!rows[0]) return { ok: false, error: "محصول غير موجود" };
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر التعديل" };
  }
}
