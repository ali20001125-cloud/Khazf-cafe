import "server-only";
import { db } from "./db";

/**
 * المنيو الورقي — من الكتالوج نفسه، بتصميمٍ غير تصميم الهاتف.
 *
 * قال المالك: «مو حلو يصير نفس الإلكتروني». فالشكل مختلف: ورقةٌ تُقرأ
 * من بعيد على الطاولة، لا بطاقاتٌ تُضغط. لكن **الأسعار من القاعدة
 * نفسها** — ورقةٌ تُصمَّم يدوياً تتأخّر عن أوّل تغيير سعر، فيقول الزبون
 * «بالورقة مكتوب ٤٠٠٠» والكاشير يأخذ ٤٥٠٠.
 *
 * وتختلف عن `publicMenu` في شيئين مقصودين:
 * - **بلا ساعات الظهور.** الورقة تُطبع مرّةً وتبقى أشهراً؛ مشروب
 *   الصباح يُطبع ولو طُبعت الورقة ليلاً.
 * - **بلا البضاعة.** أكياس البنّ مسعّرةٌ رمزياً حتى يفتح المتجر، وورقة
 *   الطاولة للمشروبات.
 */

export type PrintItem = {
  id: string;
  name: string;
  nameEn: string | null;
  category: string;
  minPrice: number;
  maxPrice: number;
  /** «مميّز» في المنيو — شريطٌ داكن في الورقة الكلاسيكية. */
  special: boolean;
};

export type PrintAddon = { title: string; options: { name: string; price: number }[] };

export async function printMenu(businessId: string): Promise<PrintItem[]> {
  const rows = (await db()`
    select p.id, p.name, nullif(btrim(p.name_en), '') as name_en, p.category,
           p.is_daily_special as special,
           min(pc.price)::int as min_price, max(pc.price)::int as max_price
    from products p
    join product_crops pc on pc.product_id = p.id and pc.available
    where p.business_id = ${businessId} and p.active and p.menu_visible
      and p.kind = 'drink'
    group by p.id
    order by p.sort, p.name
  `) as {
    id: string; name: string; name_en: string | null; category: string;
    special: boolean; min_price: number; max_price: number;
  }[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    nameEn: r.name_en,
    category: r.category,
    minPrice: Number(r.min_price),
    maxPrice: Number(r.max_price),
    special: !!r.special,
  }));
}

/** الإضافات المدفوعة مرّةً واحدة لكل المنيو، بأسمائها على الطاولة. */
export async function printAddons(businessId: string): Promise<PrintAddon[]> {
  const rows = (await db()`
    select coalesce(nullif(btrim(g.menu_name), ''), g.name) as title,
           o.name, o.price_delta, g.sort as gsort, o.sort as osort
    from modifier_groups g
    join modifier_options o on o.group_id = g.id and o.available and o.price_delta > 0
    where g.business_id = ${businessId} and g.active
      and exists (
        select 1 from product_modifier_groups pmg
        join products p on p.id = pmg.product_id
        where pmg.group_id = g.id and p.active and p.menu_visible
      )
    order by g.sort, o.sort
  `) as { title: string; name: string; price_delta: number }[];

  const out: PrintAddon[] = [];
  for (const r of rows) {
    let g = out.find((x) => x.title === r.title);
    if (!g) {
      g = { title: r.title, options: [] };
      out.push(g);
    }
    g.options.push({ name: r.name, price: Number(r.price_delta) });
  }
  return out;
}

/** كم مشروباً لمشروبٍ مجاني — يُطبع تحت رمز الولاء. */
export async function stampsPerReward(): Promise<number> {
  const rows = (await db()`
    select coalesce((value->>'stamps_per_reward')::int, 5) as per
    from settings where branch_id is null and key = 'loyalty' limit 1
  `) as { per: number }[];
  return rows[0]?.per ?? 5;
}
