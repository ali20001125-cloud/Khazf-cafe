import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { money, timeAr } from "@/lib/format";
import { auditActionLabel } from "@/lib/labels";
import {
  todayGlance, recentShiftVariances, recentStockVariances, recentExceptions,
  openShiftsCount, salesLast7Days,
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
  if (!(await can(user, "view_reports"))) redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="text-red-600">لا يوجد فرع فعّال.</p>;
  const settings = await getSettings();
  const currency = strSetting(settings, "currency", "د.ع");

  const [glance, series, shiftVars, stockVars, exceptions, openShifts, closed] = await Promise.all([
    todayGlance(branch.id),
    salesLast7Days(branch.id),
    recentShiftVariances(branch.id),
    recentStockVariances(branch.id),
    recentExceptions(user.bid),
    openShiftsCount(branch.id),
    isTodayClosed(branch.id),
  ]);

  const issues = shiftVars.filter((s) => s.variance !== 0).length + stockVars.length;
  const max = Math.max(1, ...series.map((s) => s.total));

  return (
    <div className="space-y-6">
      {/* الرأس والحالة */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">نظرة عامة</h1>
          <p className="mt-1 text-sm">
            {issues === 0 ? (
              <span className="text-emerald-600">اليوم تمام ✅</span>
            ) : (
              <span className="text-amber-700">انتبه ⚠️ عندك {issues} أمر يحتاج نظرك</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LockToggle locked={branch.pos_locked} />
          <DayCloseButton closed={closed} />
        </div>
      </div>

      {branch.pos_locked && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">الكاشير مقفل حالياً — لا بيع جديد حتى تفتحه.</p>
      )}

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="طلبات اليوم" value={String(glance.orders)} />
        <Kpi label="إيراد اليوم" value={money(glance.revenue, currency)} />
        <Kpi label="كاش" value={money(glance.cash, currency)} />
        <Kpi label="بطاقة" value={money(glance.card, currency)} />
      </div>
      {openShifts > 0 && <p className="text-sm text-emerald-600">وردية مفتوحة الآن.</p>}

      {/* رسم مبيعات ٧ أيام */}
      <section className="card p-5">
        <h2 className="mb-4 font-display text-sm font-bold text-ink">مبيعات آخر ٧ أيام</h2>
        <div className="flex items-end justify-between gap-2" style={{ height: 140 }}>
          {series.map((s) => {
            const h = Math.round((s.total / max) * 110);
            const dd = new Date(s.day);
            return (
              <div key={s.day} className="flex flex-1 flex-col items-center justify-end gap-1">
                <span className="nums text-[9px] text-muted">{s.total ? money(s.total, "") : ""}</span>
                <div className="w-full rounded-t-md bg-accent/80" style={{ height: `${Math.max(4, h)}px` }} />
                <span className="nums text-[10px] text-muted">{dd.getDate()}/{dd.getMonth() + 1}</span>
              </div>
            );
          })}
        </div>
      </section>

      {/* فروقات + شاذّ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section title="فروقات الدرج (ورديات مُغلقة)">
          {shiftVars.length === 0 ? <Empty /> : (
            <ul className="divide-y divide-line">
              {shiftVars.slice(0, 6).map((s) => (
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
          {stockVars.length === 0 ? <Empty /> : (
            <ul className="divide-y divide-line">
              {stockVars.slice(0, 6).map((s, i) => (
                <li key={i} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-ink">{s.material_name}</span>
                  <span className={`nums ${vColor(s.variance_pct)}`}>{s.variance > 0 ? "+" : ""}{s.variance} ({s.variance_pct ?? 0}%)</span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="الأحداث الحسّاسة">
        {exceptions.length === 0 ? <Empty /> : (
          <ul className="divide-y divide-line">
            {exceptions.slice(0, 10).map((e, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-ink">{auditActionLabel(e.action)}{e.user_name && <span className="text-xs text-muted"> · {e.user_name}</span>}</span>
                <span className="nums text-xs text-muted">{timeAr(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="nums mt-1 font-display text-xl font-bold text-ink">{value}</div>
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
function Empty() { return <p className="text-sm text-muted">لا شيء.</p>; }
