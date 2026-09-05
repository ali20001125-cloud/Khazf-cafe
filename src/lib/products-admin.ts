import "server-only";
import { db } from "./db";

export type AdminCrop = { id: string; material_id: string; crop_name: string; price: number; available: boolean };
export type AdminItem = { id: string; material_name: string; qty: number; only_takeaway: boolean };
export type AdminProduct = {
  id: string;
  name: string;
  category: string;
  active: boolean;
  paused: boolean;
  recipe_id: string | null;
  coffee_grams: number;
  crops: AdminCrop[];
  items: AdminItem[];
};

export async function getProductsAdmin(businessId: string): Promise<AdminProduct[]> {
  const products = (await db()`
    select id, name, category, active, paused, sort
    from products where business_id = ${businessId} order by sort, name
  `) as { id: string; name: string; category: string; active: boolean; paused: boolean }[];

  const crops = (await db()`
    select pc.id, pc.product_id, pc.material_id, m.name as crop_name, pc.price, pc.available
    from product_crops pc
    join products p on p.id = pc.product_id
    join materials m on m.id = pc.material_id
    where p.business_id = ${businessId}
    order by m.name
  `) as (AdminCrop & { product_id: string })[];

  const recipes = (await db()`
    select r.id, r.product_id, r.coffee_grams
    from recipes r join products p on p.id = r.product_id
    where p.business_id = ${businessId} and r.active
  `) as { id: string; product_id: string; coffee_grams: number }[];

  const items = (await db()`
    select ri.id, r.product_id, m.name as material_name, ri.qty, ri.only_takeaway
    from recipe_items ri
    join recipes r on r.id = ri.recipe_id and r.active
    join materials m on m.id = ri.material_id
    join products p on p.id = r.product_id
    where p.business_id = ${businessId}
    order by ri.only_takeaway, m.name
  `) as (AdminItem & { product_id: string })[];

  return products.map((p) => {
    const rec = recipes.find((r) => r.product_id === p.id) ?? null;
    return {
      id: p.id, name: p.name, category: p.category, active: p.active, paused: p.paused,
      recipe_id: rec?.id ?? null,
      coffee_grams: rec ? Number(rec.coffee_grams) : 0,
      crops: crops.filter((c) => c.product_id === p.id).map((c) => ({
        id: c.id, material_id: c.material_id, crop_name: c.crop_name, price: Number(c.price), available: c.available,
      })),
      items: items.filter((i) => i.product_id === p.id).map((i) => ({
        id: i.id, material_name: i.material_name, qty: Number(i.qty), only_takeaway: i.only_takeaway,
      })),
    };
  });
}
