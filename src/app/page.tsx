import { db } from "@/lib/db";
import { getSettings, strSetting } from "@/lib/settings";
import { money, stockLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

type Counts = { products: number; materials: number; users: number };
type StockRow = { name: string; base_unit: string; cached_stock: number };

async function load(): Promise<{ ok: boolean; counts?: Counts; low?: StockRow[]; shop: string }> {
  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");
  try {
    const c = (await db()`
      select
        (select count(*) from products where active)  as products,
        (select count(*) from materials where active) as materials,
        (select count(*) from users where active)     as users
    `) as { products: string; materials: string; users: string }[];
    const low = (await db()`
      select name, base_unit, cached_stock
      from materials
      where active and cached_stock <= low_threshold
      order by name
    `) as StockRow[];
    return {
      ok: true,
      shop,
      counts: {
        products: Number(c[0].products),
        materials: Number(c[0].materials),
        users: Number(c[0].users),
      },
      low,
    };
  } catch {
    return { ok: false, shop };
  }
}

export default async function Home() {
  const { ok, counts, low, shop } = await load();

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-bold text-[#5b4636]">{shop}</h1>
        <p className="mt-1 text-sm text-neutral-500">نظام الكاشير — قيد البناء</p>
      </header>

      {!ok ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-700">
          تعذّر الاتصال بقاعدة البيانات. تحقّق من DATABASE_URL.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="المشروبات" value={counts!.products} />
            <Stat label="المواد" value={counts!.materials} />
            <Stat label="الموظفون" value={counts!.users} />
          </div>

          <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">تنبيه المخزون المنخفض</h2>
            {low && low.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {low.map((r) => (
                  <li key={r.name} className="flex justify-between text-amber-700">
                    <span>{r.name}</span>
                    <span>{stockLabel(r.cached_stock, r.base_unit)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-emerald-600">كل المواد ضمن الحدّ الآمن.</p>
            )}
          </section>

          <p className="mt-8 text-center text-xs text-neutral-400">
            حجر الأساس جاهز · {money(0)} — البيع يبدأ في المرحلة القادمة
          </p>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center">
      <div className="text-2xl font-bold text-[#5b4636]">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );
}
