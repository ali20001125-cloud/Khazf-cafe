import "server-only";
import { db } from "./db";

/** كتالوج البيع: مشروبات فعّالة مع محاصيلها وأسعارها لكل محصول. */

export type CatalogCrop = {
  material_id: string;
  crop_name: string;
  price: number;
  available: boolean;
};

export type CatalogProduct = {
  id: string;
  name: string;
  category: string;
  paused: boolean;
  crops: CatalogCrop[];
};

type Row = {
  id: string;
  name: string;
  category: string;
  paused: boolean;
  material_id: string;
  crop_name: string;
  price: number;
  available: boolean;
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
  `) as Row[];

  const map = new Map<string, CatalogProduct>();
  for (const r of rows) {
    let prod = map.get(r.id);
    if (!prod) {
      prod = { id: r.id, name: r.name, category: r.category, paused: r.paused, crops: [] };
      map.set(r.id, prod);
    }
    prod.crops.push({
      material_id: r.material_id,
      crop_name: r.crop_name,
      price: Number(r.price),
      available: r.available,
    });
  }
  return [...map.values()];
}
