"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { db } from "@/lib/supabase";
import { adminCookieName, checkPin, isAdmin, sessionToken } from "@/lib/admin-auth";

function guard() {
  if (!isAdmin()) throw new Error("غير مصرّح");
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
  const id = String(formData.get("id") ?? "");
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    unit: String(formData.get("unit") ?? "gram"),
    stock: Number(formData.get("stock") ?? 0),
    low_alert: Number(formData.get("low_alert") ?? 0),
    is_coffee: formData.get("is_coffee") === "on",
  };
  if (!payload.name) throw new Error("الاسم مطلوب");

  const { error } = id
    ? await db.from("materials").update(payload).eq("id", id)
    : await db.from("materials").insert(payload);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/materials");
}

export async function toggleMaterial(formData: FormData) {
  guard();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const { error } = await db.from("materials").update({ active: !active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/materials");
}

/* ------------------------------ المشروبات ------------------------------ */

export async function saveDrink(formData: FormData) {
  guard();
  const id = String(formData.get("id") ?? "");
  const crop = String(formData.get("crop_material_id") ?? "");
  const payload = {
    name: String(formData.get("name") ?? "").trim(),
    category: String(formData.get("category") ?? "hot"),
    price: Math.max(0, Math.floor(Number(formData.get("price") ?? 0))),
    loyalty_eligible: formData.get("loyalty_eligible") === "on",
    crop_material_id: crop || null,
    sort_order: Math.floor(Number(formData.get("sort_order") ?? 100)),
  };
  if (!payload.name) throw new Error("الاسم مطلوب");

  const { error } = id
    ? await db.from("drinks").update(payload).eq("id", id)
    : await db.from("drinks").insert(payload);
  if (error) throw new Error(error.message);

  // تعديل السعر حدث رقابي — يُسجَّل ولا يُمحى.
  await db.from("audit_log").insert({
    event: id ? "price_edit" : "drink_create",
    amount: payload.price,
    reason: payload.name,
    meta: { drink_id: id || null },
  });

  revalidatePath("/admin/drinks");
  revalidatePath("/pos");
}

export async function toggleDrink(formData: FormData) {
  guard();
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const { error } = await db.from("drinks").update({ active: !active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/drinks");
  revalidatePath("/pos");
}

/* ------------------------------ الوصفات ------------------------------ */

export async function saveRecipeRow(formData: FormData) {
  guard();
  const drink_id = String(formData.get("drink_id") ?? "");
  const material_id = String(formData.get("material_id") ?? "");
  const qty = Number(formData.get("qty") ?? 0);
  const takeaway_only = formData.get("takeaway_only") === "on";
  if (!drink_id || !material_id) throw new Error("بيانات ناقصة");
  if (!(qty > 0)) throw new Error("الكمية يجب أن تكون أكبر من صفر");

  const { error } = await db
    .from("drink_materials")
    .upsert({ drink_id, material_id, qty, takeaway_only }, { onConflict: "drink_id,material_id" });
  if (error) throw new Error(error.message);

  await db.from("audit_log").insert({
    event: "recipe_edit",
    reason: `qty=${qty}`,
    meta: { drink_id, material_id },
  });

  revalidatePath(`/admin/drinks/${drink_id}`);
}

export async function deleteRecipeRow(formData: FormData) {
  guard();
  const drink_id = String(formData.get("drink_id") ?? "");
  const material_id = String(formData.get("material_id") ?? "");
  const { error } = await db
    .from("drink_materials")
    .delete()
    .eq("drink_id", drink_id)
    .eq("material_id", material_id);
  if (error) throw new Error(error.message);

  await db.from("audit_log").insert({
    event: "recipe_edit",
    reason: "delete",
    meta: { drink_id, material_id },
  });

  revalidatePath(`/admin/drinks/${drink_id}`);
}

/* ------------------------------ الإعدادات ------------------------------ */

export async function saveSetting(formData: FormData) {
  guard();
  const key = String(formData.get("key") ?? "");
  const raw = String(formData.get("value") ?? "").trim();
  const kind = String(formData.get("kind") ?? "text");
  if (!key) throw new Error("مفتاح ناقص");

  const value = kind === "number" ? [Number(raw)] : raw;
  const { error } = await db
    .from("settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);

  revalidatePath("/admin/settings");
  revalidatePath("/pos");
}
