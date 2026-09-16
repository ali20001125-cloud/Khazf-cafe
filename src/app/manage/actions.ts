"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError, type Permission } from "@/lib/permissions";
import { getActiveBranchId } from "@/lib/branch";
import { recordPurchase, applyStockCount, type CountItem, type CountResult } from "@/lib/inventory";

type Err = { ok: false; error: string };

/** الفرع الفعّال أو فراغ — للأحداث التي تخصّ العمل كلّه لا فرعاً بعينه. */
async function branchOrNull(bid: string): Promise<string> {
  const b = await getActiveBranchId(bid);
  if (!b) throw new Error("لا يوجد فرع فعّال");
  return b;
}

async function branchOrErr(bid: string): Promise<string | Err> {
  const b = await getActiveBranchId(bid);
  return b ?? { ok: false, error: "لا يوجد فرع فعّال" };
}

async function audit(businessId: string, branchId: string, userId: string, action: string, reason: string) {
  try {
    await db()`
      insert into audit_log (business_id, branch_id, user_id, action, entity_type, reason)
      values (${businessId}, ${branchId}, ${userId}, ${action}, 'inventory', ${reason})
    `;
  } catch {
    /* لا يُفشل العملية */
  }
}

function guard<T extends unknown[], R>(perm: Permission, fn: (u: { uid: string; bid: string }, ...a: T) => Promise<R>) {
  return async (...args: T): Promise<R | Err> => {
    try {
      const u = await requirePermission(perm);
      return await fn(u, ...args);
    } catch (e) {
      if (e instanceof AuthError) return { ok: false, error: e.message };
      const msg = e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "خطأ";
      return { ok: false, error: msg };
    }
  };
}

export const addStockAction = guard(
  "inventory.receive",
  async (u, materialId: string, qtyBase: number, unitCostBase: number, reason: string) => {
    if (!Number.isFinite(qtyBase) || qtyBase <= 0) return { ok: false as const, error: "كمية غير صالحة" };
    const b = await branchOrErr(u.bid);
    if (typeof b !== "string") return b;
    const newStock = await recordPurchase(u.bid, b, u.uid, materialId, Math.round(qtyBase), Math.round(unitCostBase || 0), reason);
    await audit(u.bid, b, u.uid, "add_stock", `+${Math.round(qtyBase)} (${reason || "شراء"})`);
    return { ok: true as const, newStock };
  }
);

export const stockCountAction = guard(
  "inventory.count",
  async (u, counts: CountItem[]): Promise<{ ok: true; result: CountResult } | Err> => {
    if (!counts?.length) return { ok: false as const, error: "لا مواد في الجرد" };
    const b = await branchOrErr(u.bid);
    if (typeof b !== "string") return b;
    const result = await applyStockCount(u.bid, b, u.uid, counts);
    const flagged = result.items.filter((i) => i.variance !== 0).length;
    await audit(u.bid, b, u.uid, "stock_count", `جرد ${result.items.length} مادة · فروقات ${flagged}`);
    return { ok: true as const, result };
  }
);

/**
 * «نبّهني إذا قلّ عن…» — حدّ التنبيه لكل مادة.
 *
 * ليس تعديلاً للرصيد: الرصيد يبقى مشتقّاً من الدفتر ولا يُكتب بيد أحد.
 * هذا رقم عرض فقط يقرّر متى يظهر التنبيه، لذلك لا يحتاج جرداً ولا تسوية.
 */
export const setLowThresholdAction = guard(
  "inventory.receive",
  async (u, materialId: string, thresholdBase: number) => {
    if (!Number.isFinite(thresholdBase) || thresholdBase < 0)
      return { ok: false as const, error: "رقم غير صالح" };
    const rows = (await db()`
      update materials set low_threshold = ${Math.round(thresholdBase)}
      where id = ${materialId} and business_id = ${u.bid}
      returning id
    `) as { id: string }[];
    if (!rows[0]) return { ok: false as const, error: "مادة غير موجودة" };
    return { ok: true as const };
  }
);

// ── مخزون متقدّم (هجرة 0028) ─────────────────────────────────────────

/**
 * شراء **بوحدة الشراء**: «٢ كرتون» بدل «٢٤٠٠٠ مل».
 *
 * التحويل يقع في القاعدة لا هنا: هي التي تعرف `base_qty` وتكتب الوحدة مع
 * صفّ الدفتر في إدراجٍ واحد — والدفتر للإلحاق فقط، فلا يُدرَج ثم يُرقَّع.
 */
export const addStockByUnitAction = guard(
  "inventory.receive",
  async (u, materialId: string, unitId: string, unitQty: number, costPerUnit: number, reason: string) => {
    if (!Number.isFinite(unitQty) || unitQty <= 0)
      return { ok: false as const, error: "الكمية غير صالحة" };
    const b = await branchOrErr(u.bid);
    if (typeof b !== "string") return b;
    const rows = (await db()`
      select record_purchase_units(${u.bid}, ${b}, ${u.uid}, ${materialId}, ${unitId},
                                   ${unitQty}, ${Math.round(costPerUnit || 0)}, ${reason || "شراء"}) as r
    `) as { r: { base_qty: number; unit_cost: number; unit: string } }[];
    const r = rows[0].r;
    await audit(u.bid, b, u.uid, "add_stock", `+${unitQty} ${r.unit} (= ${r.base_qty})`);
    return { ok: true as const, ...r };
  }
);

/** تعريف وحدة شراء لمادة: «كرتون = ١٢٠٠٠ مل». */
export const addMaterialUnitAction = guard(
  "inventory.adjust",
  async (u, materialId: string, name: string, baseQty: number, isDefault: boolean) => {
    if (!name.trim()) return { ok: false as const, error: "اكتب اسم الوحدة" };
    if (!Number.isFinite(baseQty) || baseQty <= 0)
      return { ok: false as const, error: "كم وحدة أساس في هذه الوحدة؟" };
    // افتراضيّ واحد لكل مادة: أكثرُ من واحد يعني «أيّهما؟» في كل شاشة
    if (isDefault) {
      await db()`
        update material_units set is_default = false
        where material_id = ${materialId} and is_default
      `;
    }
    await db()`
      insert into material_units (material_id, name, base_qty, is_default, sort)
      values (${materialId}, ${name.trim()}, ${Math.round(baseQty)}, ${isDefault},
              coalesce((select max(sort) + 1 from material_units where material_id = ${materialId}), 1))
    `;
    await audit(u.bid, await branchOrNull(u.bid), u.uid, "material_unit_added",
                `${name.trim()} = ${Math.round(baseQty)}`);
    return { ok: true as const };
  }
);

export const removeMaterialUnitAction = guard(
  "inventory.adjust",
  async (u, unitId: string) => {
    // تُعطَّل ولا تُحذف: حركاتٌ قديمة تشير إليها، وحذفها يُفقد «كم كرتوناً اشتريت»
    await db()`update material_units set active = false where id = ${unitId}`;
    await audit(u.bid, await branchOrNull(u.bid), u.uid, "material_unit_removed", "تعطيل وحدة شراء");
    return { ok: true as const };
  }
);

/**
 * «كم أريد أن يبقى في المحلّ؟» — الرقم الذي تُبنى عليه قائمة الشراء.
 *
 * غير حدّ التنبيه: ذاك يقول **متى** أُنبّهك، وهذا يقول **كم** تشتري.
 * ومن لا يعرف كم يشتري يشتري قليلاً فينفد أو كثيراً فيتلف.
 */
export const setParLevelAction = guard(
  "inventory.adjust",
  async (u, materialId: string, parLevel: number) => {
    if (!Number.isFinite(parLevel) || parLevel < 0)
      return { ok: false as const, error: "رقم غير صالح" };
    await db()`
      update materials set par_level = ${Math.round(parLevel)}
      where id = ${materialId} and business_id = ${u.bid}
    `;
    await audit(u.bid, await branchOrNull(u.bid), u.uid, "par_level_set",
                `المطلوب بعد الشراء ${Math.round(parLevel)}`);
    return { ok: true as const };
  }
);

/**
 * البنّ العالق في المطحنة — يُقاس مرّةً ويُذكَّر به عند كل جرد.
 *
 * لا يُضاف تلقائياً إلى المعدود: النظام يذكّر ولا يفترض، وما يُفترض عن
 * المستخدم يُحسب مرّتين يوماً ما.
 */
export const setHopperGramsAction = guard(
  "inventory.adjust",
  async (u, materialId: string, grams: number) => {
    if (!Number.isFinite(grams) || grams < 0)
      return { ok: false as const, error: "رقم غير صالح" };
    const g = Math.round(grams);
    const rows = (await db()`
      update materials set hopper_grams = ${g}
      where id = ${materialId} and business_id = ${u.bid}
      returning name
    `) as { name: string }[];
    if (rows.length === 0) return { ok: false as const, error: "مادة غير موجودة" };
    await audit(u.bid, await branchOrNull(u.bid), u.uid, "hopper_grams_set",
                `${rows[0].name}: عالق في المطحنة ${g} غ`);
    return { ok: true as const };
  }
);

// ── أسباب الهدر ──────────────────────────────────────────────────────
export const addWasteReasonAction = guard(
  "settings.manage",
  async (u, label: string) => {
    const l = label.trim();
    if (l.length < 2) return { ok: false as const, error: "اكتب السبب" };
    // مفتاح مستقرّ لا يتغيّر بتغيّر النصّ: الحركات القديمة تشير إليه
    const key = `r_${Date.now().toString(36)}`;
    await db()`
      insert into waste_reasons (key, business_id, label, sort)
      values (${key}, ${u.bid}, ${l},
              coalesce((select max(sort) + 1 from waste_reasons where business_id = ${u.bid}), 1))
    `;
    await audit(u.bid, await branchOrNull(u.bid), u.uid, "waste_reason_added", l);
    return { ok: true as const };
  }
);

export const setWasteReasonActiveAction = guard(
  "settings.manage",
  async (u, key: string, active: boolean) => {
    // تُعطَّل ولا تُحذف: هدرٌ سُجّل بها في الماضي يجب أن يبقى مقروءاً
    await db()`
      update waste_reasons set active = ${active}
      where key = ${key} and business_id = ${u.bid}
    `;
    await audit(u.bid, await branchOrNull(u.bid), u.uid,
                active ? "waste_reason_enabled" : "waste_reason_disabled", key);
    return { ok: true as const };
  }
);
