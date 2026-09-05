"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { recordWaste } from "@/lib/inventory";

export type WasteMaterial = { id: string; name: string; base_unit: "g" | "ml" | "pcs" };

export async function listWasteMaterials(): Promise<WasteMaterial[] | { error: string }> {
  try {
    const u = await requirePermission("record_waste");
    return (await db()`
      select id, name, base_unit from materials
      where business_id = ${u.bid} and active order by base_unit, name
    `) as WasteMaterial[];
  } catch (e) {
    if (e instanceof AuthError) return { error: e.message };
    throw e;
  }
}

export async function wasteAction(
  materialId: string,
  qtyBase: number,
  reason: string
): Promise<{ ok: true; newStock: number } | { ok: false; error: string }> {
  try {
    const u = await requirePermission("record_waste");
    if (!Number.isFinite(qtyBase) || qtyBase <= 0) return { ok: false, error: "كمية غير صالحة" };
    if (!reason) return { ok: false, error: "اختر السبب" };
    const branchId = await getActiveBranchId(u.bid);
    if (!branchId) return { ok: false, error: "لا يوجد فرع فعّال" };
    const newStock = await recordWaste(u.bid, branchId, u.uid, materialId, Math.round(qtyBase), reason);
    try {
      await db()`
        insert into audit_log (business_id, branch_id, user_id, action, entity_type, reason)
        values (${u.bid}, ${branchId}, ${u.uid}, 'record_waste', 'inventory', ${`${Math.round(qtyBase)} — ${reason}`})
      `;
    } catch {
      /* لا يُفشل */
    }
    return { ok: true, newStock };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    const msg = e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "تعذّر التسجيل";
    return { ok: false, error: msg };
  }
}
