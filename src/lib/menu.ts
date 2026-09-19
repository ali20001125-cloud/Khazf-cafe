import "server-only";
import { db } from "./db";

/**
 * المنيو الإلكتروني.
 *
 * المنيو ليس نسخةً من الكتالوج — هو الكتالوج نفسه مقروءاً من جهة الزبون.
 * لو كان جدولاً ثانياً لصار للمشروب اسمان وسعران، فيرفع المالك السعر في
 * الكاشير ويبقى القديم معروضاً على الطاولة. وهذا أسوأ من ألّا يكون ثمّة
 * منيو أصلاً.
 */

export type MenuItem = {
  id: string;
  name: string;
  category: string;
  note: string | null;
  imageUrl: string | null;
  paused: boolean;
  /** «مميّز» — يأخذ بطاقةً بعرض الصفّ. رايةٌ قائمة في الجدول فُتحت للمنيو. */
  special: boolean;
  kind: "drink" | "retail";
  minPrice: number;
  maxPrice: number;
  variants: string[];
};

/**
 * ما يراه من لا حساب له.
 *
 * لا تكلفة ولا رصيد ولا معرّف مادة — الاسم والسعر والأنواع فقط. وكل عمودٍ
 * زائد هنا تسريبٌ لا يلاحظه أحد حتى يقرأه منافس.
 */
export async function publicMenu(businessId: string): Promise<MenuItem[]> {
  const rows = (await db()`
    select product_id, name, category, note, image_url, paused, kind, special,
           min_price, max_price, variants
    from public_menu(${businessId})
  `) as {
    product_id: string; name: string; category: string; note: string | null;
    image_url: string | null; paused: boolean; kind: "drink" | "retail";
    special: boolean; min_price: number; max_price: number; variants: string[];
  }[];

  return rows.map((r) => ({
    id: r.product_id,
    name: r.name,
    category: r.category,
    note: r.note,
    imageUrl: r.image_url,
    paused: r.paused,
    special: r.special,
    kind: r.kind,
    minPrice: Number(r.min_price),
    maxPrice: Number(r.max_price),
    variants: r.variants ?? [],
  }));
}

/** العمل الوحيد — المنيو صفحةٌ عامّة بلا جلسة تقول لأيّ عملٍ تنتمي. */
export async function soleBusinessId(): Promise<string | null> {
  const rows = (await db()`
    select id from businesses order by created_at limit 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}

export type MenuAdminRow = MenuItem & { menuVisible: boolean; active: boolean };

/** صفوف المالك: كل المنتجات، حتى المخفيّة عن المنيو — فهو من يُظهرها. */
export async function menuAdmin(businessId: string): Promise<MenuAdminRow[]> {
  const rows = (await db()`
    select p.id, p.name, p.category, p.menu_note as note, p.image_url,
           p.paused, p.kind, p.menu_visible, p.active, p.is_daily_special as special,
           coalesce(min(pc.price), 0)::int as min_price,
           coalesce(max(pc.price), 0)::int as max_price,
           coalesce(array_agg(m.name order by m.name)
                    filter (where m.name is not null), '{}') as variants
    from products p
    left join product_crops pc on pc.product_id = p.id and pc.available
    left join materials m on m.id = pc.material_id
    where p.business_id = ${businessId} and p.active
    group by p.id
    order by p.kind, p.sort, p.name
  `) as {
    id: string; name: string; category: string; note: string | null;
    image_url: string | null; paused: boolean; kind: "drink" | "retail";
    menu_visible: boolean; active: boolean; special: boolean;
    min_price: number; max_price: number; variants: string[];
  }[];

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    note: r.note,
    imageUrl: r.image_url,
    paused: r.paused,
    special: r.special,
    kind: r.kind,
    menuVisible: r.menu_visible,
    active: r.active,
    minPrice: Number(r.min_price),
    maxPrice: Number(r.max_price),
    variants: r.variants ?? [],
  }));
}
