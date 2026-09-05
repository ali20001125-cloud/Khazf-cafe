import "server-only";
import { db } from "./db";

export type MaterialRow = {
  id: string;
  name: string;
  base_unit: "g" | "ml" | "pcs";
  cached_stock: number;
  low_threshold: number;
  current_cost: number;
  active: boolean;
};

export async function listMaterials(businessId: string): Promise<MaterialRow[]> {
  return (await db()`
    select id, name, base_unit, cached_stock, low_threshold, current_cost, active
    from materials
    where business_id = ${businessId} and active
    order by base_unit, name
  `) as MaterialRow[];
}

export async function recordPurchase(
  businessId: string, branchId: string, userId: string,
  materialId: string, qty: number, unitCost: number, reason: string
): Promise<number> {
  const rows = (await db()`
    select record_purchase(${businessId}, ${branchId}, ${userId}, ${materialId}, ${qty}, ${unitCost}, ${reason}) as s
  `) as { s: number }[];
  return Number(rows[0].s);
}

export async function recordWaste(
  businessId: string, branchId: string, userId: string,
  materialId: string, qty: number, reason: string
): Promise<number> {
  const rows = (await db()`
    select record_waste(${businessId}, ${branchId}, ${userId}, ${materialId}, ${qty}, ${reason}) as s
  `) as { s: number }[];
  return Number(rows[0].s);
}

export type CountItem = { material_id: string; counted: number };
export type CountResult = {
  count_id: string;
  items: { material_id: string; name: string; expected: number; counted: number; variance: number; variance_pct: number | null }[];
};

export async function applyStockCount(
  businessId: string, branchId: string, userId: string, counts: CountItem[]
): Promise<CountResult> {
  const json = JSON.stringify(counts);
  const rows = (await db()`
    select apply_stock_count(${businessId}, ${branchId}, ${userId}, ${json}::jsonb) as r
  `) as { r: CountResult }[];
  return rows[0].r;
}
