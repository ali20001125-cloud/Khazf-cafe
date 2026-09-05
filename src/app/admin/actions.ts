"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { adminCookieName, checkPin, isAdmin, sessionToken } from "@/lib/admin-auth";
import type { DrinkCategory, MaterialUnit } from "@/lib/types";

/**
 * كل action يفحص الصلاحية بنفسه.
 * لا يكفي فحص الـ layout: Server Actions تُنادى بطلب مباشر
 * لا يمرّ على شجرة الصفحات إطلاقاً.
 */
function guard() {
  if (!isAdmin()) throw new Error("غير مصرّح");
}

const UNITS: MaterialUnit[] = ["gram", "ml", "piece"];
const CATEGORIES: DrinkCategory[] = ["hot", "cold", "espresso", "other"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function uuid(v: FormDataEntryValue | null): string | null {
  const s = String(v ?? "");
  return UUID.test(s) ? s : null;
}

function positive(v: FormDataEntryValue | null): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/* ------------------------------ الدخول ------------------------------ */

export async function login(_prev: string | null, formData: FormData): Promise<string | null> {
  const pin = String(formData.get("pin") ?? "");
  if (!checkPin(pin)) return "رمز غير صحيح";
  cookies().set(adminCookieName(), sessionToken(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  revalidatePath("/admin");
  return null;
}

export async function logout() {
  cookies().delete(adminCookieName());
  revalidatePath("/admin");
}

/* ------------------------------ المواد ------------------------------ */

export async function saveMaterial(formData: FormData) {
  guard();
  const id = uuid(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const unitRaw = String(formData.get("unit") ?? "gram") as MaterialUnit;
  const unit = UNITS.includes(unitRaw) ? unitRaw : "gram";
  const stock = positive(formData.get("stock"));
  const lowAlert = positive(formData.get("low_alert"));
  const isCoffee = formData.get("is_coffee") === "on";

  if (!name) throw new Error("الاسم مطلوب");

  if (id) {
    await db()`
      update materials
         set name = ${name}, unit = ${unit}::material_unit, stock = ${stock},
             low_alert = ${lowAlert}, is_coffee = ${isCoffee}
       where id = ${id}::uuid
    `;
  } else {
    await db()`
      insert into materials (name, unit, stock, low_alert, is_coffee)
      values (${name}, ${unit}::material_unit, ${stock}, ${lowAlert}, ${isCoffee})
    `;
  }
  revalidatePath("/admin/materials");
  revalidatePath("/admin");
}

export async function toggleMaterial(formData: FormData) {
  guard();
  const id = uuid(formData.get("id"));
  if (!id) throw new Error("معرّف غير صالح");
  await db()`update materials set active = not active where id = ${id}::uuid`;
  revalidatePath("/admin/materials");
  revalidatePath("/admin");
}

/* ------------------------------ المشروبات ------------------------------ */

export async function saveDrink(formData: FormData) {
  guard();
  const id = uuid(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const catRaw = String(formData.get("category") ?? "hot") as DrinkCategory;
  const category = CATEGORIES.includes(catRaw) ? catRaw : "hot";
  const price = Math.floor(positive(formData.get("price")));
  const eligible = formData.get("loyalty_eligible") === "on";
  const crop = uuid(formData.get("crop_material_id"));
  const sortOrder = Math.floor(Number(formData.get("sort_order") ?? 100)) || 100;

  if (!name) throw new Error("الاسم مطلوب");

  if (id) {
    await db()`
      update drinks
         set name = ${name}, category = ${category}::drink_category, price = ${price},
             loyalty_eligible = ${eligible}, crop_material_id = ${crop}::uuid,
             sort_order = ${sortOrder}
       where id = ${id}::uuid
    `;
  } else {
    await db()`
      insert into drinks (name, category, price, loyalty_eligible, crop_material_id, sort_order)
      values (${name}, ${category}::drink_category, ${price}, ${eligible}, ${crop}::uuid, ${sortOrder})
    `;
  }

  // تعديل السعر حدث رقابي — يُسجَّل ولا يُمحى.
  await db()`
    insert into audit_log (event, amount, reason, meta)
    values (${id ? "price_edit" : "drink_create"}, ${price}, ${name},
            ${JSON.stringify({ drink_id: id })}::jsonb)
  `;

  revalidatePath("/admin/drinks");
  revalidatePath("/pos");
}

export async function toggleDrink(formData: FormData) {
  guard();
  const id = uuid(formData.get("id"));
  if (!id) throw new Error("معرّف غير صالح");
  await db()`update drinks set active = not active where id = ${id}::uuid`;
  revalidatePath("/admin/drinks");
  revalidatePath("/pos");
}

/* ------------------------------ الوصفات ------------------------------ */

export async function saveRecipeRow(formData: FormData) {
  guard();
  const drinkId = uuid(formData.get("drink_id"));
  const materialId = uuid(formData.get("material_id"));
  const qty = Number(formData.get("qty") ?? 0);
  const takeawayOnly = formData.get("takeaway_only") === "on";

  if (!drinkId || !materialId) throw new Error("بيانات ناقصة");
  if (!(qty > 0)) throw new Error("الكمية يجب أن تكون أكبر من صفر");

  await db()`
    insert into drink_materials (drink_id, material_id, qty, takeaway_only)
    values (${drinkId}::uuid, ${materialId}::uuid, ${qty}, ${takeawayOnly})
    on conflict (drink_id, material_id)
    do update set qty = excluded.qty, takeaway_only = excluded.takeaway_only
  `;

  await db()`
    insert into audit_log (event, reason, meta)
    values ('recipe_edit', ${`qty=${qty}`},
            ${JSON.stringify({ drink_id: drinkId, material_id: materialId })}::jsonb)
  `;

  revalidatePath(`/admin/drinks/${drinkId}`);
}

export async function deleteRecipeRow(formData: FormData) {
  guard();
  const drinkId = uuid(formData.get("drink_id"));
  const materialId = uuid(formData.get("material_id"));
  if (!drinkId || !materialId) throw new Error("بيانات ناقصة");

  await db()`
    delete from drink_materials
     where drink_id = ${drinkId}::uuid and material_id = ${materialId}::uuid
  `;

  await db()`
    insert into audit_log (event, reason, meta)
    values ('recipe_edit', 'delete',
            ${JSON.stringify({ drink_id: drinkId, material_id: materialId })}::jsonb)
  `;

  revalidatePath(`/admin/drinks/${drinkId}`);
}

/* ------------------------------ الإعدادات ------------------------------ */

const SETTING_KEYS = new Set([
  "shop_name",
  "shop_phone",
  "currency",
  "extra_shot_price",
  "shot_grams",
  "variance_alert_pct",
  "stamps_for_free",
  "stamp_cap_per_order",
  "free_drink_max_price",
  "stamp_daily_limit",
  "stamp_expiry_days",
]);

export async function saveSetting(formData: FormData) {
  guard();
  const key = String(formData.get("key") ?? "");
  const raw = String(formData.get("value") ?? "").trim();
  const kind = String(formData.get("kind") ?? "text");

  // قائمة بيضاء: لا يُكتب مفتاح إعداد لم نعرّفه
  if (!SETTING_KEYS.has(key)) throw new Error("مفتاح إعداد غير معروف");

  let value: unknown;
  if (kind === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error("القيمة يجب أن تكون رقماً");
    value = [n];
  } else {
    value = raw;
  }

  await db()`
    insert into settings (key, value, updated_at)
    values (${key}, ${JSON.stringify(value)}::jsonb, now())
    on conflict (key) do update set value = excluded.value, updated_at = now()
  `;

  revalidatePath("/admin/settings");
  revalidatePath("/pos");
}
