import "server-only";
import { db } from "./db";

/** كتالوج البيع: مشروبات فعّالة + محاصيلها (بسعر لكل محصول) + مجموعات الخيارات. */

export type CatalogCrop = {
  material_id: string;
  crop_name: string;
  price: number;
  /** راية المالك: «هذا المحصول يُقدَّم أو لا» */
  available: boolean;
  /**
   * كم كوباً يكفي له المخزون فعلاً (هجرة 0027). منفصلان لأن الكوب والغطاء
   * يدخلان السفري وحده: قد تنفد الأكواب ويبقى الجلوس ممكناً، ورقمٌ واحد
   * لهما يمنع بيعاً ممكناً.
   */
  servings_dine_in: number;
  servings_takeaway: number;
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
           pc.material_id, m.name as crop_name, pc.price, pc.available,
           coalesce(sl.servings_dine_in, 0)  as servings_dine_in,
           coalesce(sl.servings_takeaway, 0) as servings_takeaway
    from products p
    join product_crops pc on pc.product_id = p.id
    join materials m on m.id = pc.material_id
    left join v_servings_left sl
           on sl.product_id = p.id and sl.crop_material_id = pc.material_id
    where p.active and p.business_id = ${businessId}
    order by p.sort, p.name, m.name
  `) as {
    id: string; name: string; category: string; paused: boolean;
    material_id: string; crop_name: string; price: number; available: boolean;
    servings_dine_in: number; servings_takeaway: number;
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
    prod.crops.push({
      material_id: r.material_id, crop_name: r.crop_name, price: Number(r.price),
      available: r.available,
      servings_dine_in: Number(r.servings_dine_in),
      servings_takeaway: Number(r.servings_takeaway),
    });
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

/**
 * ترتيب المشروبات بالأكثر مبيعاً في آخر ٣٠ يوماً.
 *
 * الشبكة يجب أن تضع ما يُطلب كثيراً تحت الإبهام. والترتيب من البيع الفعلي
 * لا من ظنّ أحد: القائمة تُرتّب نفسها كلّما تغيّر ذوق الزبائن.
 */
export async function topSellerRank(businessId: string): Promise<Map<string, number>> {
  const rows = (await db()`
    select oi.product_id, sum(oi.qty)::int as cups
    from order_items oi
    join orders o on o.id = oi.order_id
    where o.business_id = ${businessId}
      and o.status not in ('VOIDED', 'CANCELLED', 'DRAFT', 'PENDING_PAYMENT')
      and o.created_at >= now() - interval '30 days'
    group by oi.product_id
  `) as { product_id: string; cups: number }[];
  return new Map(rows.map((r) => [r.product_id, r.cups]));
}
