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

export type TxnRow = { created_at: string; material_name: string; qty: number; unit_cost: number | null; reason: string; user_name: string | null };

export async function listPurchases(businessId: string): Promise<TxnRow[]> {
  return (await db()`
    select t.created_at, m.name as material_name, t.qty_delta as qty, t.unit_cost, t.reason, u.name as user_name
    from inventory_transactions t
    join materials m on m.id = t.material_id
    left join users u on u.id = t.user_id
    where t.business_id = ${businessId} and t.type = 'PURCHASE'
    order by t.created_at desc limit 40
  `) as TxnRow[];
}

export async function listWasteLog(businessId: string): Promise<TxnRow[]> {
  return (await db()`
    select t.created_at, m.name as material_name, t.qty_delta as qty, t.unit_cost, t.reason, u.name as user_name
    from inventory_transactions t
    join materials m on m.id = t.material_id
    left join users u on u.id = t.user_id
    where t.business_id = ${businessId} and t.type in ('WASTE','STAFF')
    order by t.created_at desc limit 40
  `) as TxnRow[];
}

export type CountLog = { id: string; created_at: string; user_name: string | null; items: number; flagged: number };
export async function listCounts(branchId: string): Promise<CountLog[]> {
  return (await db()`
    select c.id, c.created_at, u.name as user_name,
           count(i.*)::int as items,
           count(i.*) filter (where i.variance <> 0)::int as flagged
    from stock_counts c
    left join stock_count_items i on i.count_id = c.id
    left join users u on u.id = c.user_id
    where c.branch_id = ${branchId}
    group by c.id, u.name
    order by c.created_at desc limit 20
  `) as CountLog[];
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
