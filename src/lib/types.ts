export type MaterialUnit = "gram" | "ml" | "piece";
export type DrinkCategory = "hot" | "cold" | "espresso" | "other";
export type PaymentMethod = "cash" | "card";
export type ServiceType = "takeaway" | "dinein";

export type Material = {
  id: string;
  name: string;
  unit: MaterialUnit;
  stock: number;
  low_alert: number;
  is_coffee: boolean;
  active: boolean;
};

export type Drink = {
  id: string;
  name: string;
  category: DrinkCategory;
  price: number;
  loyalty_eligible: boolean;
  crop_material_id: string | null;
  sort_order: number;
  active: boolean;
};

export type RecipeRow = {
  drink_id: string;
  material_id: string;
  qty: number;
  takeaway_only: boolean;
};

export type CartLine = {
  key: string;
  drink_id: string;
  name: string;
  unit_price: number;
  qty: number;
  service: ServiceType;
  extra_shots: number;
};

export type ReceiptData = {
  number: number;
  total: number;
  change_due: number | null;
  payment_method: PaymentMethod;
  cash_received: number | null;
  created_at: string;
  lines: { name: string; qty: number; unit_price: number; service: ServiceType; extra_shots: number }[];
  shop_name: string;
  shop_phone: string;
  currency: string;
};
