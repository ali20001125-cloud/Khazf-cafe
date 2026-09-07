import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { materialOverview, type MaterialOverview } from "@/lib/inventory-overview";
import { listPurchases, listWasteLog, listCounts } from "@/lib/inventory";
import { money, stockLabel } from "@/lib/format";
import InventoryActions from "@/components/InventoryActions";

/**
 * المخزون.
 *
 * مقسوم كما يفكّر صاحب المقهى لا كما تُخزَّن الجداول:
 *   • **محاصيل القهوة** أولاً — كل محصول سطر مستقلّ، لأن «٥ كيلو» قد
 *     تكون خمسة محاصيل مختلفة لكل واحد سعره ومذاقه ومشروباته.
 *   • **بقية المواد** (حليب · أكواب · سيروب) بعدها.
 *
 * ولكل سطر ما يهمّ فعلاً: كم بقي، وكم يُستهلك يومياً، و**كم يوماً يكفي** —
 * فهذا ما يحدّد متى يشتري، لا الرصيد وحده.
 */
export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "inventory.view"))) redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="card p-8 text-center text-red-600">لا يوجد فرع فعّال.</p>;

  const [items, settings, purchases, waste, counts] = await Promise.all([
    materialOverview(user.bid, 30),
    getSettings(),
    listPurchases(user.bid),
    listWasteLog(user.bid),
    listCounts(branch.id),
  ]);
  const currency = strSetting(settings, "currency", "د.ع");

  const crops = items.filter((m) => m.is_crop);
  const supplies = items.filter((m) => !m.is_crop);
  const totalValue = items.reduce((s, m) => s + m.stock_value, 0);
  const lowCount = items.filter((m) => m.low_threshold > 0 && m.stock <= m.low_threshold).length;
  const soonCount = items.filter((m) => m.days_left != null && m.days_left <= 7).length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">المخزون</h1>
          <p className="mt-1 text-sm text-muted">
            الرصيد تراكمي: كل شراء يُضاف، وكل بيع وهدر يُنقص، والدفتر يحفظ السلسلة.
          </p>
        </div>
        <InventoryActions materials={items.map((m) => ({
          id: m.id, name: m.name, base_unit: m.base_unit, stock: m.stock,
        }))} currency={currency} />
      </div>

      {/* تنبيهات تسبق الأرقام */}
      {(lowCount > 0 || soonCount > 0) && (
        <div className="card border-amber-200 bg-amber-50/50 p-4">
          <p className="font-display font-bold text-amber-900">قرب النفاد</p>
          <ul className="mt-2 space-y-1 text-sm text-amber-900/80">
            {items
              .filter((m) => (m.days_left != null && m.days_left <= 7) || (m.low_threshold > 0 && m.stock <= m.low_threshold))
              .map((m) => (
                <li key={m.id}>
                  <Link href={`/manage/inventory/${m.id}`} className="underline">
                    {m.name}
                  </Link>{" "}
                  — بقي <span className="nums">{stockLabel(m.stock, m.base_unit)}</span>
                  {m.days_left != null && (
                    <> · يكفي <span className="nums">{m.days_left}</span> يوماً تقريباً</>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="قيمة المخزون" value={money(totalValue, currency)} />
        <Stat label="محاصيل القهوة" value={String(crops.length)} />
        <Stat label="مواد أخرى" value={String(supplies.length)} />
      </div>

      <Group
        title="محاصيل القهوة"
        note="كل محصول رصيد مستقلّ. الباريستا يختار المحصول عند البيع، فينقص هو وحده."
        items={crops}
        currency={currency}
      />

      <Group
        title="المواد الأخرى"
        note="حليب وأكواب وسيروب — تنقص حسب وصفة كل مشروب."
        items={supplies}
        currency={currency}
      />

      {/* السجلّات */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Log title="آخر المشتريات" empty="لا مشتريات بعد.">
          {purchases.slice(0, 6).map((p, i) => (
            <li key={i} className="flex justify-between py-2 text-sm">
              <span className="text-ink">{p.material_name}</span>
              <span className="nums text-emerald-700">+{p.qty}</span>
            </li>
          ))}
        </Log>
        <Log title="آخر الهدر" empty="لا هدر مسجّل.">
          {waste.slice(0, 6).map((w, i) => (
            <li key={i} className="flex justify-between py-2 text-sm">
              <span className="text-ink">
                {w.material_name}
                <span className="block text-[11px] text-muted">{w.reason}</span>
              </span>
              <span className="nums text-red-600">{w.qty}</span>
            </li>
          ))}
        </Log>
        <Log title="آخر عمليات الجرد" empty="لا جرد بعد.">
          {counts.slice(0, 6).map((c) => (
            <li key={c.id} className="flex justify-between py-2 text-sm">
              <span className="text-ink">
                {c.user_name ?? "—"}
                <span className="block text-[11px] text-muted nums">{c.items} مادة</span>
              </span>
              <span className={`nums ${c.flagged > 0 ? "text-red-600" : "text-emerald-600"}`}>
                {c.flagged > 0 ? `${c.flagged} فرق` : "مطابق"}
              </span>
            </li>
          ))}
        </Log>
      </div>
    </div>
  );
}

function Group({
  title,
  note,
  items,
  currency,
}: {
  title: string;
  note: string;
  items: MaterialOverview[];
  currency: string;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h2 className="font-display font-bold text-ink">{title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">{note}</p>
      <div className="space-y-2">
        {items.map((m) => {
          const low = m.low_threshold > 0 && m.stock <= m.low_threshold;
          const soon = m.days_left != null && m.days_left <= 7;
          return (
            <Link
              key={m.id}
              href={`/manage/inventory/${m.id}`}
              className={`card flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:border-accent/40 ${
                low || soon ? "border-amber-300 bg-amber-50/30" : ""
              }`}
            >
              <div className="min-w-0">
                <span className="font-display font-bold text-ink">{m.name}</span>
                {m.used_in && (
                  <span className="mt-0.5 block truncate text-[11px] text-muted">{m.used_in}</span>
                )}
              </div>

              <div className="flex items-center gap-5 text-left">
                <div>
                  <span className="block text-[10px] text-muted">الرصيد</span>
                  <span className={`nums font-display font-bold ${low || soon ? "text-amber-700" : "text-ink"}`}>
                    {stockLabel(m.stock, m.base_unit)}
                  </span>
                </div>
                <div>
                  <span className="block text-[10px] text-muted">يومياً</span>
                  <span className="nums text-sm text-muted">
                    {m.avg_per_day > 0 ? stockLabel(Math.round(m.avg_per_day), m.base_unit) : "—"}
                  </span>
                </div>
                <div className="min-w-[64px]">
                  <span className="block text-[10px] text-muted">يكفي</span>
                  <span className={`nums text-sm ${soon ? "font-semibold text-amber-700" : "text-muted"}`}>
                    {m.days_left != null ? `${m.days_left} يوم` : "—"}
                  </span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="nums mt-1 font-display text-xl font-bold text-ink">{value}</p>
    </div>
  );
}

function Log({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const list = Array.isArray(children) ? children : [children];
  return (
    <section className="card p-5">
      <h3 className="mb-1 font-display text-sm font-bold text-ink">{title}</h3>
      {list.filter(Boolean).length === 0 ? (
        <p className="py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </section>
  );
}
