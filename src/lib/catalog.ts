import "server-only";
import { db } from "./db";

/** كتالوج البيع: مشروبات فعّالة + محاصيلها (بسعر لكل محصول) + مجموعات الخيارات. */

export type CatalogCrop = {
  material_id: string;
  crop_name: string;
  price: number;
  available: boolean;
};

export type CatalogOption = { id: string; name: string; price_delta: number };
export type CatalogGroup = {
  id: string;
  name: string;
  selection: "single" | "multi";
  required: boolean;
  options: CatalogOption[];
};

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  paused: boolean;
  crops: CatalogCrop[];
  groups: CatalogGroup[];
};

export async function getCatalog(businessId: string): Promise<CatalogProduct[]> {
  const rows = (await db()`
    select p.id, p.name, p.category, p.paused,
           pc.material_id, m.name as crop_name, pc.price, pc.available
    from products p
    join product_crops pc on pc.product_id = p.id
    join materials m on m.id = pc.material_id
    where p.active and p.business_id = ${businessId}
    order by p.sort, p.name, m.name
  `) as {
    id: string; name: string; category: string; paused: boolean;
    material_id: string; crop_name: string; price: number; available: boolean;
  }[];

  const groupRows = (await db()`
    select pmg.product_id, g.id as gid, g.name as gname, g.selection, g.required, g.sort as gsort,
           o.id as oid, o.name as oname, o.price_delta
    from product_modifier_groups pmg
    join modifier_groups g on g.id = pmg.group_id and g.active
    join modifier_options o on o.group_id = g.id and o.available
    join products p on p.id = pmg.product_id
    where p.business_id = ${businessId} and p.active
    order by pmg.product_id, g.sort, o.sort
  `) as {
    product_id: string; gid: string; gname: string; selection: "single" | "multi";
    required: boolean; gsort: number; oid: string; oname: string; price_delta: number;
  }[];

  const map = new Map<string, CatalogProduct>();
  for (const r of rows) {
    let prod = map.get(r.id);
    if (!prod) {
      prod = { id: r.id, name: r.name, category: r.category, paused: r.paused, crops: [], groups: [] };
      map.set(r.id, prod);
    }
    prod.crops.push({ material_id: r.material_id, crop_name: r.crop_name, price: Number(r.price), available: r.available });
  }

  // مجموعات الخيارات لكل مشروب
  const gmap = new Map<string, CatalogGroup>(); // key: product_id:gid
  for (const g of groupRows) {
    const prod = map.get(g.product_id);
    if (!prod) continue;
    const key = `${g.product_id}:${g.gid}`;
    let grp = gmap.get(key);
    if (!grp) {
      grp = { id: g.gid, name: g.gname, selection: g.selection, required: g.required, options: [] };
      gmap.set(key, grp);
      prod.groups.push(grp);
    }
    grp.options.push({ id: g.oid, name: g.oname, price_delta: Number(g.price_delta) });
  }

  return [...map.values()];
}
