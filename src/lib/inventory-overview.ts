import "server-only";
import { db } from "./db";

/**
 * نظرة المخزون كما يفكّر بها صاحب المقهى.
 *
 * الرصيد **تراكمي دائماً**: كل حركة تُضاف لما قبلها، والدفتر يحفظ السلسلة
 * كاملة. «٥ كيلو → بعنا ١٫٥ → بقي ٣٫٥ → أضفت ١ فصار ٤٫٥» — هذه السلسلة
 * هي ما يعرضه `materialLedger`، لا رقماً نهائياً بلا تفسير.
 */

export type MaterialOverview = {
  id: string;
  name: string;
  base_unit: "g" | "ml" | "pcs";
  stock: number;
  low_threshold: number;
  current_cost: number;
  stock_value: number;
  /** محصول قهوة يُختار عند البيع، لا مادة عامة. */
  is_crop: boolean;
  /** المشروبات التي تستعمل هذا المحصول. */
  used_in: string;
  consumed_period: number;
  avg_per_day: number;
  /** كم يوماً يكفي بالمعدّل الحالي — null إن لم يُستهلك بعد. */
  days_left: number | null;
};

export async function materialOverview(
  businessId: string,
  days = 30
): Promise<MaterialOverview[]> {
  const rows = (await db()`
    select id, name, base_unit, stock, low_threshold, current_cost, stock_value,
           is_crop, used_in, consumed_period,
           avg_per_day::float8 as avg_per_day,
           days_left::float8 as days_left
    from material_overview(${businessId}, ${days})
  `) as MaterialOverview[];
  return rows.map((r) => ({
    ...r,
    stock: Number(r.stock),
    stock_value: Number(r.stock_value),
    consumed_period: Number(r.consumed_period),
  }));
}

export type LedgerLine = {
  at: string;
  kind: string;
  qty_delta: number;
  running_balance: number;
  reason: string | null;
  user_name: string | null;
  order_number: number | null;
};

/** حركات مادة واحدة مع الرصيد بعد كل حركة — «كيف وصلنا لهذا الرقم». */
export async function materialLedger(materialId: string, limit = 60): Promise<LedgerLine[]> {
  const rows = (await db()`
    select at, kind, qty_delta, running_balance, reason, user_name, order_number
    from material_ledger(${materialId}, ${limit})
  `) as LedgerLine[];
  return rows.map((r) => ({ ...r, running_balance: Number(r.running_balance) }));
}

export type MaterialBasic = {
  id: string;
  name: string;
  base_unit: "g" | "ml" | "pcs";
  stock: number;
  low_threshold: number;
  current_cost: number;
};

export async function getMaterial(
  businessId: string,
  materialId: string
): Promise<MaterialBasic | null> {
  const rows = (await db()`
    select id, name, base_unit, cached_stock as stock, low_threshold, current_cost
    from materials where id = ${materialId} and business_id = ${businessId}
  `) as MaterialBasic[];
  return rows[0] ?? null;
}

/** أسماء عربية لأنواع حركة المخزون — لا رموز إنجليزية أمام المالك. */
export const MOVE_LABELS: Record<string, string> = {
  PURCHASE: "شراء",
  SALE: "بيع",
  LOYALTY_REWARD: "مكافأة ولاء",
  STAFF: "مشروب موظف",
  WASTE: "هدر",
  ADJUSTMENT: "تسوية جرد",
  COUNT: "جرد",
  TRANSFER_IN: "نقل وارد",
  TRANSFER_OUT: "نقل صادر",
  OTHER_APPROVED: "عملية بموافقة",
};

// ── مخزون متقدّم (هجرة 0028) ─────────────────────────────────────────

export type MaterialUnit = {
  id: string;
  material_id: string;
  name: string;
  base_qty: number;
  is_default: boolean;
};

/** وحدات الشراء لكل مادة — يعرّفها المالك مرّة ويشتري بها دائماً. */
export async function materialUnits(businessId: string): Promise<MaterialUnit[]> {
  return (await db()`
    select u.id, u.material_id, u.name, u.base_qty, u.is_default
    from material_units u
    join materials m on m.id = u.material_id
    where m.business_id = ${businessId} and u.active and m.active
    order by u.material_id, u.sort, u.name
  `) as MaterialUnit[];
}

export type ShoppingRow = {
  material_id: string;
  name: string;
  base_unit: string;
  stock: number;
  low_threshold: number;
  par_level: number;
  need_base: number;
  avg_per_day: number;
  days_left: number | null;
  unit_id: string | null;
  unit_name: string | null;
  unit_base_qty: number | null;
  need_units: number | null;
  urgency: "out" | "low" | "top_up" | "ok";
};

/** ما ينبغي شراؤه اليوم — الناقص أولاً، بوحدة الشراء لا بالغرام. */
export async function shoppingList(businessId: string, days = 14): Promise<ShoppingRow[]> {
  return (await db()`
    select material_id, name, base_unit::text as base_unit, stock, low_threshold, par_level,
           need_base, avg_per_day, days_left,
           unit_id, unit_name, unit_base_qty, need_units, urgency
    from shopping_list(${businessId}, ${days})
  `) as ShoppingRow[];
}

export type WasteReason = { key: string; label: string; active: boolean; sort: number };

export async function wasteReasons(businessId: string, all = false): Promise<WasteReason[]> {
  return (await db()`
    select key, label, active, sort from waste_reasons
    where business_id = ${businessId} and (${all} or active)
    order by active desc, sort, label
  `) as WasteReason[];
}

export type WasteByReason = { reason: string; label: string; events: number; cost: number };

/** تكلفة الهدر موزّعةً على أسبابه — بالدينار، فالغرام لا يُقرأ. */
export async function wasteByReason(branchId: string, days = 30): Promise<WasteByReason[]> {
  return (await db()`
    select reason, label, events, cost::int as cost
    from waste_by_reason(${branchId}, ${days})
  `) as WasteByReason[];
}

export type CountDoc = {
  id: string;
  user_name: string;
  created_at: string;
  business_day: string;
  counted_materials: number;
  total_materials: number | null;
  is_partial: boolean;
  with_variance: number;
};

export async function recentCounts(branchId: string, limit = 10): Promise<CountDoc[]> {
  return (await db()`
    select id, user_name, created_at, business_day::text as business_day,
           counted_materials, total_materials, is_partial, with_variance
    from v_stock_counts where branch_id = ${branchId}
    order by created_at desc limit ${limit}
  `) as CountDoc[];
}
