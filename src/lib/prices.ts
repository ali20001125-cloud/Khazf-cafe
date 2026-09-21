import "server-only";
import { db } from "./db";

/**
 * كل سعرٍ في المحلّ في شاشةٍ واحدة.
 *
 * السعر يسكن `product_crops`: لكل مشروبٍ سعرٌ لكل محصول، لأن كوب
 * الحبّة الغالية ليس كوب الرخيصة. وهذا صحيحٌ في القاعدة ومُتعبٌ في
 * اليد: رفع الأسعار عشرة بالمئة كان يعني فتح أحد عشر منتجاً وحفظ كلٍّ
 * منها — والأسعار هنا تتحرّك.
 *
 * ولا يُعدَّل السعر في مكانين: «المشروبات» تبقى بيته للمنتج الواحد،
 * وهذه الشاشة تفتح كلّ البيوت معاً. كلاهما يكتب في العمود نفسه.
 */

export type PriceRow = {
  /** معرّف صفّ `product_crops` — لا المنتج: المنتج له أكثر من سعر. */
  id: string;
  productId: string;
  productName: string;
  category: string;
  kind: "drink" | "retail";
  /** الاسم المعروض للمحصول، كما يقرأه الزبون. */
  cropName: string;
  price: number;
  available: boolean;
  /** تكلفة الكوب الآن — كي يُرى الهامش وهو يُغيَّر، لا بعده. */
  cost: number;
};

export async function priceRows(businessId: string): Promise<PriceRow[]> {
  const rows = (await db()`
    select pc.id, p.id as product_id, p.name as product_name, p.category, p.kind,
           coalesce(m.menu_label, m.name) as crop_name,
           pc.price, pc.available,
           -- تكلفة الكوب من الوصفة الفعّالة: حبوبٌ بسعر هذا المحصول،
           -- وما سواها بتكلفته الجارية. والأكواب والأغطية داخلة.
           coalesce((
             select round(r.coffee_grams * m.current_cost)
                  + coalesce((
                      select sum(ri.qty * m2.current_cost)
                      from recipe_items ri
                      join materials m2 on m2.id = ri.material_id
                      where ri.recipe_id = r.id
                    ), 0)
             from recipes r
             where r.product_id = p.id and r.active
             order by r.version desc limit 1
           ), 0)::int as cost
    from product_crops pc
    join products p on p.id = pc.product_id
    join materials m on m.id = pc.material_id
    where p.business_id = ${businessId} and p.active
    order by p.kind, p.sort, p.name, m.name
  `) as {
    id: string; product_id: string; product_name: string; category: string;
    kind: "drink" | "retail"; crop_name: string; price: number;
    available: boolean; cost: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    productId: r.product_id,
    productName: r.product_name,
    category: r.category,
    kind: r.kind,
    cropName: r.crop_name,
    price: Number(r.price),
    available: r.available,
    cost: Number(r.cost),
  }));
}
