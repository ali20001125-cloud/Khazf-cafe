/**
 * أنواع مطابقة لمخطّط القاعدة (db/migrations/0001_schema.sql).
 * المرجع: docs/CAFE-POS-TECH.md — الجزء ١.
 * كل الفلوس/الكميات أعداد صحيحة.
 */

export type UserRole = "owner" | "barista";
export type MaterialUnit = "g" | "ml" | "pcs";
export type OrderStatus = "DRAFT" | "PAID" | "COMPLETED" | "VOIDED" | "REFUNDED";
export type Fulfillment = "takeaway" | "dine_in";
export type PaymentMethod = "cash" | "card";
export type PaymentStatus = "PENDING" | "CONFIRMED" | "FAILED";
export type InvTxnType = "PURCHASE" | "SALE" | "WASTE" | "STAFF" | "ADJUSTMENT" | "COUNT";
export type CashMovementType = "OPENING" | "SALE" | "REFUND" | "EXPENSE" | "DROP" | "REMOVAL";
export type ShiftStatus = "OPEN" | "CLOSED";

export type Business = { id: string; name: string; created_at: string };

export type Branch = {
  id: string;
  business_id: string;
  name: string;
  timezone: string;
  standard_float: number;
  pos_locked: boolean;
  active: boolean;
};

export type User = {
  id: string;
  business_id: string;
  name: string;
  role: UserRole;
  active: boolean;
  // pin_hash لا يُرسل للواجهة أبداً
};

export type Material = {
  id: string;
  business_id: string;
  name: string;
  base_unit: MaterialUnit;
  low_threshold: number;
  current_cost: number;
  cached_stock: number;
  active: boolean;
};

export type Product = {
  id: string;
  business_id: string;
  name: string;
  category: string;
  active: boolean;
  paused: boolean;
  daily_limit: number | null;
  is_daily_special: boolean;
  sort: number;
};

export type ProductCrop = {
  id: string;
  product_id: string;
  material_id: string;
  price: number;
  available: boolean;
};

export type Recipe = {
  id: string;
  product_id: string;
  version: number;
  coffee_grams: number;
  active: boolean;
};

export type RecipeItem = {
  id: string;
  recipe_id: string;
  material_id: string;
  qty: number;
  only_takeaway: boolean;
};

/** بند السلة قبل الدفع (في المتصفح). */
export type CartLine = {
  key: string;
  product_id: string;
  name: string;
  crop_material_id: string; // المحصول المختار
  unit_price: number;
  qty: number;
};

/** لقطة الوصفة المخزّنة في order_items.recipe_snapshot وقت البيع. */
export type RecipeSnapshot = {
  coffee_grams: number;
  crop_material_id: string;
  items: { material_id: string; qty: number; only_takeaway: boolean }[];
};
