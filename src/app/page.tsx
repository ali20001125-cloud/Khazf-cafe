import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings, strSetting } from "@/lib/settings";
import { stockLabel } from "@/lib/format";
import { currentUser } from "@/lib/auth";
import { logoutAction } from "@/app/login/actions";

export const dynamic = "force-dynamic";

type Counts = { products: number; materials: number; users: number };
type StockRow = { name: string; base_unit: string; cached_stock: number };

async function loadOwner(): Promise<{ counts: Counts; low: StockRow[] } | null> {
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
      counts: {
        products: Number(c[0].products),
        materials: Number(c[0].materials),
        users: Number(c[0].users),
      },
      low,
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  const user = currentUser();
  if (!user) redirect("/login");

  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");
  const isOwner = user.role === "owner";
  const data = isOwner ? await loadOwner() : null;

  return (
    <main className="mx-auto max-w-md px-5 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[#5b4636]">{shop}</h1>
          <p className="mt-0.5 text-sm text-neutral-500">
            أهلاً {user.name} · {isOwner ? "المالك" : "باريستا"}
          </p>
        </div>
        <form action={logoutAction}>
          <button className="rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-600">
            خروج
          </button>
        </form>
      </header>

      <div className="mb-6 grid grid-cols-1 gap-3">
        <Link
          href="/pos"
          className="block rounded-xl bg-[#8a6a4f] py-5 text-center text-lg font-semibold text-white active:scale-[0.99]"
        >
          ابدأ البيع
        </Link>
        {isOwner && (
          <Link
            href="/manage"
            className="block rounded-xl border border-neutral-200 bg-white py-4 text-center text-base font-semibold text-[#5b4636]"
          >
            الإدارة
          </Link>
        )}
      </div>

      {isOwner && data ? (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="المشروبات" value={data.counts.products} />
            <Stat label="المواد" value={data.counts.materials} />
            <Stat label="الموظفون" value={data.counts.users} />
          </div>
          <section className="mt-6 rounded-xl border border-neutral-200 bg-white p-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-700">المخزون المنخفض</h2>
            {data.low.length > 0 ? (
              <ul className="space-y-1 text-sm">
                {data.low.map((r) => (
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
        </>
      ) : null}
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
