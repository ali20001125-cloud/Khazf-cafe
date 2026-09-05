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
      select name, base_unit, cached_stock from materials
      where active and cached_stock <= low_threshold order by name
    `) as StockRow[];
    return {
      counts: { products: Number(c[0].products), materials: Number(c[0].materials), users: Number(c[0].users) },
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
    <main className="min-h-screen">
      {/* شريط علوي داكن */}
      <header className="topbar px-5 pb-8 pt-8">
        <div className="mx-auto flex max-w-md items-center justify-between">
          <div>
            <div className="font-display text-2xl font-bold text-cream">خزف</div>
            <p className="mt-0.5 text-sm text-cream/60">
              {user.name} · {isOwner ? "المالك" : "باريستا"}
            </p>
          </div>
          <form action={logoutAction}>
            <button className="chip border border-cream/20 bg-cream/5 px-4 py-2 text-cream/80">خروج</button>
          </form>
        </div>
      </header>

      <div className="mx-auto -mt-4 max-w-md px-5 pb-12">
        <div className="grid grid-cols-1 gap-3">
          <Link href="/pos" className="btn-primary block py-6 text-center text-xl shadow-lift">
            ابدأ البيع
          </Link>
          {isOwner && (
            <Link href="/manage" className="btn-ghost block py-4 text-center text-base shadow-soft">
              لوحة الإدارة
            </Link>
          )}
        </div>

        {isOwner && data && (
          <>
            <div className="mt-6 grid grid-cols-3 gap-3 nums">
              <Stat label="المشروبات" value={data.counts.products} />
              <Stat label="المواد" value={data.counts.materials} />
              <Stat label="الموظفون" value={data.counts.users} />
            </div>
            <section className="card mt-4 p-5">
              <h2 className="mb-3 font-display text-sm font-bold text-ink">المخزون المنخفض</h2>
              {data.low.length > 0 ? (
                <ul className="space-y-2">
                  {data.low.map((r) => (
                    <li key={r.name} className="flex justify-between text-sm">
                      <span className="text-ink">{r.name}</span>
                      <span className="nums font-medium text-accent">{stockLabel(r.cached_stock, r.base_unit)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted">كل المواد ضمن الحدّ الآمن.</p>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4 text-center">
      <div className="font-display text-2xl font-bold text-ink">{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}
