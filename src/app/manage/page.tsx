import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import { getSettings, strSetting } from "@/lib/settings";
import { money, timeAr } from "@/lib/format";
import { auditActionLabel } from "@/lib/labels";
import {
  todayGlance, recentShiftVariances, recentStockVariances, recentExceptions,
  salesLast7Days, topProductsToday,
} from "@/lib/reports";
import { isTodayClosed } from "@/lib/day";
import DayCloseButton from "@/components/DayCloseButton";
import LockToggle from "@/components/LockToggle";

export const dynamic = "force-dynamic";

function vColor(pct: number | null): string {
  const a = Math.abs(pct ?? 0);
  if (a <= 3) return "text-emerald-600";
  if (a <= 5) return "text-amber-600";
  return "text-red-600 font-semibold";
}

export default async function Overview() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "reports.financial"))) redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="text-red-600">لا يوجد فرع فعّال.</p>;
  const settings = await getSettings();
  const currency = strSetting(settings, "currency", "د.ع");

  const [glance, series, top, shiftVars, stockVars, exceptions, shift, closed] = await Promise.all([
    todayGlance(branch.id),
    salesLast7Days(branch.id),
    topProductsToday(branch.id),
    recentShiftVariances(branch.id),
    recentStockVariances(branch.id),
    recentExceptions(user.bid),
    getOpenShift(branch.id),
    isTodayClosed(branch.id),
  ]);

  const issues = shiftVars.filter((s) => s.variance !== 0).length + stockVars.length;
  const max = Math.max(1, ...series.map((s) => s.total));
  const week = series.reduce((a, s) => a + s.total, 0);

  return (
    <div className="space-y-6">
      {/* الرأس */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">نظرة عامة</h1>
          <div className="mt-2">
            {issues === 0 ? (
              <span className="chip bg-emerald-50 text-emerald-700">اليوم تمام ✅</span>
            ) : (
              <span className="chip bg-amber-50 text-amber-700">انتبه ⚠️ {issues} أمر يحتاج نظرك</span>
            )}
            {shift && <span className="chip mr-2 bg-accent/12 text-accentdeep">وردية مفتوحة · {shift.employee_name}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LockToggle locked={branch.pos_locked} />
          <DayCloseButton closed={closed} />
        </div>
      </div>

      {branch.pos_locked && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          الكاشير مقفل حالياً — لا بيع جديد حتى تفتحه.
        </p>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="طلبات اليوم" value={String(glance.orders)} accent />
        <Kpi label="إيراد اليوم" value={money(glance.revenue, currency)} accent />
        <Kpi label="كاش" value={money(glance.cash, currency)} />
        <Kpi label="بطاقة" value={money(glance.card, currency)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* الرسم */}
        <section className="card p-5 lg:col-span-2">
          <div className="mb-4 flex items-baseline justify-between">
            <h2 className="font-display text-sm font-bold text-ink">مبيعات آخر ٧ أيام</h2>
            <span className="nums text-xs text-muted">المجموع {money(week, currency)}</span>
          </div>
          {week === 0 ? (
            <p className="py-10 text-center text-sm text-muted">لا مبيعات بعد — ستظهر هنا فور أول طلب.</p>
          ) : (
            <div className="flex items-end justify-between gap-2" style={{ height: 160 }}>
              {series.map((s) => {
                const h = Math.round((s.total / max) * 120);
                const d = new Date(s.day);
                return (
                  <div key={s.day} className="flex flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="nums text-[9px] text-muted">{s.total ? money(s.total, "") : ""}</span>
                    <div
                      className="w-full rounded-t-lg"
                      style={{
                        height: `${Math.max(4, h)}px`,
                        background: s.total ? "linear-gradient(180deg,#b0764f,#8A6B4E)" : "#E0DBD0",
                      }}
                    />
                    <span className="nums text-[10px] text-muted">{d.getDate()}/{d.getMonth() + 1}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* الأكثر مبيعاً */}
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-bold text-ink">الأكثر مبيعاً اليوم</h2>
          {top.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">لا مبيعات اليوم بعد.</p>
          ) : (
            <ul className="space-y-3">
              {top.map((t, i) => (
                <li key={t.name}>
                  <div className="flex justify-between text-sm">
                    <span className="text-ink">{i + 1}. {t.name}</span>
                    <span className="nums text-muted">{t.qty}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full rounded-full bg-sandalt">
                    <div className="h-1.5 rounded-full bg-accent/70" style={{ width: `${(t.qty / top[0].qty) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* الفروقات والشاذّ */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="فروقات الدرج">
          {shiftVars.length === 0 ? <Empty text="لا ورديات مُغلقة بعد." /> : (
            <ul className="divide-y divide-line">
              {shiftVars.slice(0, 5).map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{s.employee_name}</span>
                  <span className={`nums ${s.variance === 0 ? "text-emerald-600" : s.variance < 0 ? "text-red-600 font-semibold" : "text-amber-600"}`}>
                    {s.variance > 0 ? "+" : ""}{money(s.variance, currency)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="فروقات الجرد">
          {stockVars.length === 0 ? <Empty text="لا فروقات مسجّلة." /> : (
            <ul className="divide-y divide-line">
              {stockVars.slice(0, 5).map((s, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{s.material_name}</span>
                  <span className={`nums ${vColor(s.variance_pct)}`}>{s.variance > 0 ? "+" : ""}{s.variance} ({s.variance_pct ?? 0}%)</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="الأحداث الحسّاسة">
          {exceptions.length === 0 ? <Empty text="لا أحداث بعد." /> : (
            <ul className="divide-y divide-line">
              {exceptions.slice(0, 6).map((e, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{auditActionLabel(e.action)}
                    {e.user_name && <span className="text-xs text-muted"> · {e.user_name}</span>}
                  </span>
                  <span className="nums text-[11px] text-muted">{timeAr(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`card p-4 ${accent ? "border-accent/25" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="nums mt-1 font-display text-2xl font-bold text-ink">{value}</div>
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="mb-2 font-display text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  );
}
function Empty({ text }: { text: string }) { return <p className="py-4 text-sm text-muted">{text}</p>; }
