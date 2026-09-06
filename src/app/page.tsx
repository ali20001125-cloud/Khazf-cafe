import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSettings, strSetting } from "@/lib/settings";
import { money, stockLabel, timeAr } from "@/lib/format";
import { currentUser } from "@/lib/auth";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import { todayGlance } from "@/lib/reports";
import { logoutAction } from "@/app/login/actions";

export const dynamic = "force-dynamic";

type StockRow = { name: string; base_unit: string; cached_stock: number };

export default async function Home() {
  const user = currentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "owner";
  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");
  const currency = strSetting(settings, "currency", "د.ع");

  const branch = await getActiveBranch(user.bid);
  const shift = branch ? await getOpenShift(branch.id) : null;
  const glance = isOwner && branch ? await todayGlance(branch.id) : null;

  const low = (await db()`
    select name, base_unit, cached_stock from materials
    where business_id = ${user.bid} and active and cached_stock <= low_threshold
    order by name limit 5
  `) as StockRow[];

  return (
    <main className="min-h-screen">
      {/* شريط علوي */}
      <header className="topbar px-5 pb-10 pt-7">
        <div className="mx-auto flex max-w-lg items-start justify-between">
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

      <div className="mx-auto -mt-6 max-w-lg space-y-4 px-5 pb-12">
        {/* حالة الوردية — العنصر الحيّ */}
        <section className="card p-5 shadow-lift">
          {branch?.pos_locked ? (
            <>
              <Dot color="bg-red-500" label="الكاشير مقفل" tone="text-red-600" />
              <p className="mt-2 text-sm text-muted">أوقفه المالك مؤقتاً. لا بيع جديد حتى يُفتح.</p>
            </>
          ) : shift ? (
            <>
              <Dot color="bg-emerald-500" label="الوردية مفتوحة" tone="text-emerald-700" />
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
                <span>الباريستا: <span className="text-ink">{shift.employee_name}</span></span>
                <span className="nums">منذ {timeAr(shift.opened_at)}</span>
                <span className="nums">الفكّة {money(shift.opening_float, currency)}</span>
              </div>
              <Link href="/pos" className="btn-primary mt-4 block py-5 text-center text-xl">ابدأ البيع</Link>
            </>
          ) : (
            <>
              <Dot color="bg-neutral-400" label="لا توجد وردية مفتوحة" tone="text-muted" />
              <p className="mt-2 text-sm text-muted">افتح الوردية بالفكّة الافتتاحية لتبدأ البيع.</p>
              <Link href="/pos" className="btn-primary mt-4 block py-5 text-center text-xl">افتح الوردية</Link>
            </>
          )}
        </section>

        {/* أرقام اليوم — للمالك فقط */}
        {isOwner && glance && (
          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-sm font-bold text-ink">اليوم</h2>
              <Link href="/manage" className="text-xs text-accent">لوحة الإدارة ←</Link>
            </div>
            {glance.orders === 0 ? (
              <p className="py-2 text-sm text-muted">لا مبيعات اليوم بعد — ستظهر الأرقام هنا فور أول طلب.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Kpi label="الطلبات" value={String(glance.orders)} />
                <Kpi label="الإيراد" value={money(glance.revenue, currency)} />
                <Kpi label="كاش" value={money(glance.cash, currency)} />
                <Kpi label="بطاقة" value={money(glance.card, currency)} />
              </div>
            )}
          </section>
        )}

        {/* المخزون المنخفض */}
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-bold text-ink">المخزون المنخفض</h2>
          {low.length > 0 ? (
            <ul className="space-y-2">
              {low.map((r) => (
                <li key={r.name} className="flex justify-between text-sm">
                  <span className="text-ink">{r.name}</span>
                  <span className="nums font-medium text-amber-700">{stockLabel(r.cached_stock, r.base_unit)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-emerald-600">كل المواد ضمن الحدّ الآمن ✅</p>
          )}
        </section>

        {/* اختصارات المالك */}
        {isOwner && (
          <div className="grid grid-cols-2 gap-3">
            <Quick href="/manage" title="لوحة الإدارة" desc="اليوم · الشاذّ · التقارير" />
            <Quick href="/manage/products" title="المشروبات" desc="الأسعار والخيارات" />
            <Quick href="/manage/inventory" title="المخزون" desc="أرصدة · شراء · جرد" />
            <Quick href="/manage/settings" title="الإعدادات" desc="الأرقام والحدود" />
          </div>
        )}
      </div>
    </main>
  );
}

function Dot({ color, label, tone }: { color: string; label: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className={`font-display text-lg font-bold ${tone}`}>{label}</span>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-sand/70 p-3 text-center">
      <div className="nums font-display text-lg font-bold text-ink">{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </div>
  );
}

function Quick({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href} className="card tap p-4 hover:border-accent/40">
      <div className="font-display text-sm font-bold text-ink">{title}</div>
      <div className="mt-1 text-xs text-muted">{desc}</div>
    </Link>
  );
}
