import "server-only";
import { db } from "./db";

/**
 * الربح (§37).
 *
 * الإيراد ليس الربح. «بعت ٤٨٠٬٠٠٠» لا يقول شيئاً عن حال المقهى — الذي
 * يقوله هو ما بقي بعد ثمن القهوة والحليب والكوب.
 *
 * والتكلفة تُقرأ **من الدفتر بتكلفة يوم البيع** (هجرة 0024)، لا من سعر
 * اليوم: لو غلا كيلو القهوة الشهر القادم لتبدّل «ربح الشهر الماضي» معه،
 * وتقريرٌ يتغيّر بعد أن قُرئ لا يُبنى عليه قرار.
 */

export type DayProfit = {
  businessDay: string;
  orders: number;
  /** الإيراد صافياً بعد الإرجاعات — يُعرَف دائماً */
  revenue: number;
  /** إيراد الفواتير المختومة التكلفة وحدها: هو ما يُطرح منه `cogs` */
  revenueCosted: number;
  refunds: number;
  /** تكلفة كل ما خرج من المخزون في فواتير (بيعاً ومجاناً) */
  cogs: number;
  cogsSales: number;
  cogsFree: number;
  wasteCost: number;
  freeDrinks: number;
  /** كم فاتورة تكلفتها مختومة كاملةً — أقلّ من الكل يعني الربح حدّ أدنى */
  ordersCosted: number;
  ordersTotal: number;
};

export async function dayProfit(branchId: string, day?: string): Promise<DayProfit> {
  const rows = (await db()`
    select day_profit(${branchId}, ${day ?? null}::date) as j
  `) as { j: Record<string, number | string> }[];
  const j = rows[0]?.j ?? {};
  const n = (k: string) => Number(j[k] ?? 0);
  return {
    businessDay: String(j["business_day"] ?? ""),
    orders: n("orders"),
    revenue: n("revenue"),
    revenueCosted: n("revenue_costed"),
    refunds: n("refunds"),
    cogs: n("cogs"),
    cogsSales: n("cogs_sales"),
    cogsFree: n("cogs_free"),
    wasteCost: n("waste_cost"),
    freeDrinks: n("free_drinks"),
    ordersCosted: n("orders_costed"),
    ordersTotal: n("orders_total"),
  };
}

/**
 * ربح اليوم: إيراد الفواتير المختومة التكلفة، ناقص تكلفتها، وناقص ما ضاع
 * بلا بيع. يُحسب على المختوم وحده — فلو جمعنا فاتورةً بلا تكلفة لظهرت
 * كأنها ربحٌ صافٍ، وهو خطأٌ في اتجاه التفاؤل.
 */
export function netProfit(p: DayProfit): number {
  return p.revenueCosted - p.cogs - p.wasteCost;
}

/** هل كل فواتير اليوم مختومة التكلفة؟ إن لا، فالربح جزئيّ ويُقال ذلك. */
export function profitIsComplete(p: DayProfit): boolean {
  return p.ordersTotal === 0 || p.ordersCosted === p.ordersTotal;
}

export type ProductProfit = {
  product_id: string;
  name: string;
  /** كل ما بيع — واقعةٌ معروفة دائماً */
  cups: number;
  /** منها ما تكلفته مختومة. أقلّ من `cups` ← الأرقام المالية جزئية */
  costed_cups: number;
  /** فارغ = لا كوب مختوم، فلا ربح يُقال. الفراغ أصدق من رقمٍ واثق خاطئ */
  revenue: number | null;
  cogs: number | null;
  profit: number | null;
  margin_pct: number | null;
  profit_per_cup: number | null;
};

export async function productProfit(
  businessId: string,
  days = 30
): Promise<ProductProfit[]> {
  return (await db()`
    select product_id, name, cups, costed_cups,
           revenue::int as revenue, cogs::int as cogs, profit::int as profit,
           margin_pct, profit_per_cup
    from product_profit(${businessId}, ${days})
    where cups > 0
  `) as ProductProfit[];
}

/** ربح كل يوم في مدّة — لرسم الاتجاه. */
export async function profitTrend(
  branchId: string,
  days = 14
): Promise<{ day: string; revenue: number; profit: number }[]> {
  return (await db()`
    with d as (
      select (current_business_day(${branchId}) - g)::date as day
      from generate_series(0, ${days} - 1) g
    )
    select d.day::text as day,
           (day_profit(${branchId}, d.day)->>'revenue')::int as revenue,
           (day_profit(${branchId}, d.day)->>'revenue_costed')::int
             - (day_profit(${branchId}, d.day)->>'cogs')::int
             - (day_profit(${branchId}, d.day)->>'waste_cost')::int as profit
    from d order by d.day
  `) as { day: string; revenue: number; profit: number }[];
}

// ── البضاعة: أكياس البنّ والأدوات (هجرة 0039) ────────────────────────
/**
 * ملخّص بيع البضاعة ليومٍ محاسبي.
 *
 * معزولٌ عن المشروبات عمداً: ربح الكيس وربح اللاتيه رقمان مختلفان
 * تماماً — الكيس يبيع بـ٢٥ ألفاً ويكلّف ٧٬٥٠٠، واللاتيه يبيع بخمسة
 * ويكلّف أقلّ من ألف. جمعُهما يُنتج «هامشاً» لا يصف أيّاً منهما،
 * فلا يُبنى عليه قرار.
 */
export type RetailDay = {
  businessDay: string;
  orders: number;
  units: number;
  revenue: number;
  cogs: number;
  /** كلفة تغليف الطلب — مرّةً لكل طلب مهما كثرت أصنافه. */
  packagingCost: number;
  packagingEach: number;
  profit: number;
  ordersCosted: number;
};

export async function retailDay(branchId: string, day?: string): Promise<RetailDay> {
  const rows = (await db()`
    select retail_day(${branchId},
      coalesce(${day ?? null}::date, current_business_day(${branchId}))) as r
  `) as { r: Record<string, unknown> }[];
  const r = rows[0].r;
  return {
    businessDay: String(r.business_day),
    orders: Number(r.orders),
    units: Number(r.units),
    revenue: Number(r.revenue),
    cogs: Number(r.cogs),
    packagingCost: Number(r.packaging_cost),
    packagingEach: Number(r.packaging_each),
    profit: Number(r.profit),
    ordersCosted: Number(r.orders_costed),
  };
}

export type RetailProduct = {
  product_id: string;
  name: string;
  units: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin_pct: number | null;
};

/** ربح كل صنف بضاعة — بلا كلفة التغليف، فتلك للطلب لا للصنف. */
export async function retailProfit(businessId: string, days = 30): Promise<RetailProduct[]> {
  const rows = (await db()`
    select product_id, name, units::int as units, revenue::int as revenue,
           cogs::int as cogs, profit::int as profit, margin_pct
    from retail_profit(${businessId}, ${days})
  `) as RetailProduct[];
  return rows.map((r) => ({
    ...r,
    units: Number(r.units),
    revenue: Number(r.revenue),
    cogs: Number(r.cogs),
    profit: Number(r.profit),
    margin_pct: r.margin_pct == null ? null : Number(r.margin_pct),
  }));
}

export type RetailVariant = {
  product_id: string;
  product_name: string;
  variant_id: string | null;
  variant_name: string;
  units: number;
  revenue: number;
  cogs: number;
  profit: number;
  margin_pct: number | null;
};

/**
 * مبيعات كل **نوع**: كالدي كم باع، وسيرادو كم باع.
 *
 * `retailProfit` تجمع الأنواع تحت صنفها، وذاك يخفي ما يُشترى التقرير من
 * أجله: من يرى «٣ أكياس» لا يعرف أيّ بنٍّ يطلب في شحنته القادمة.
 */
export async function retailVariants(businessId: string, days = 30): Promise<RetailVariant[]> {
  const rows = (await db()`
    select product_id, product_name, variant_id, variant_name,
           units::int as units, revenue::int as revenue,
           cogs::int as cogs, profit::int as profit, margin_pct
    from retail_variants(${businessId}, ${days})
  `) as RetailVariant[];
  return rows.map((r) => ({
    ...r,
    units: Number(r.units),
    revenue: Number(r.revenue),
    cogs: Number(r.cogs),
    profit: Number(r.profit),
    margin_pct: r.margin_pct == null ? null : Number(r.margin_pct),
  }));
}
