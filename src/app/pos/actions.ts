"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

export type PayItem = { product_id: string; crop_material_id: string; qty: number };

export type PayInput = {
  items: PayItem[];
  fulfillment: "takeaway" | "dine_in";
  method: "cash" | "card";
  tendered: number | null;
  idempotencyKey: string;
};

export type PayResult =
  | { ok: true; orderNumber: number; total: number; change: number | null; replay: boolean }
  | { ok: false; error: string };

export async function pay(input: PayInput): Promise<PayResult> {
  let user;
  try {
    user = await requirePermission("sell");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!input.items?.length) return { ok: false, error: "الطلب فارغ" };
  if (input.method === "cash" && (input.tendered == null || input.tendered < 0))
    return { ok: false, error: "أدخل المبلغ المدفوع" };
  if (!input.idempotencyKey) return { ok: false, error: "مفتاح دفع مفقود" };

  try {
    const branchRows = (await db()`
      select id from branches where business_id = ${user.bid} and active order by created_at limit 1
    `) as { id: string }[];
    const branchId = branchRows[0]?.id;
    if (!branchId) return { ok: false, error: "لا يوجد فرع فعّال" };

    const itemsJson = JSON.stringify(
      input.items.map((i) => ({
        product_id: i.product_id,
        crop_material_id: i.crop_material_id,
        qty: i.qty,
      }))
    );

    const rows = (await db()`
      select checkout(
        ${user.bid}, ${branchId}, ${user.uid}, ${null},
        ${input.fulfillment}, ${input.method}, ${input.tendered},
        ${input.idempotencyKey}, ${itemsJson}::jsonb
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
