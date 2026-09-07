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
