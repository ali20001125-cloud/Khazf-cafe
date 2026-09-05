import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { money, timeAr } from "@/lib/format";
import { auditActionLabel } from "@/lib/labels";
import {
  todayGlance, recentShiftVariances, recentStockVariances, recentExceptions, openShiftsCount,
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

export default async function TodayDashboard() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "view_reports"))) redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="text-red-600">لا يوجد فرع فعّال.</p>;
  const branchId = branch.id;

  const settings = await getSettings();
  const currency = strSetting(settings, "currency", "د.ع");

  const [glance, shiftVars, stockVars, exceptions, openShifts, closed] = await Promise.all([
    todayGlance(branchId),
    recentShiftVariances(branchId),
    recentStockVariances(branchId),
    recentExceptions(user.bid),
    openShiftsCount(branchId),
    isTodayClosed(branchId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#5b4636]">لمحة اليوم</h2>
        <div className="flex items-center gap-2">
          <LockToggle locked={branch.pos_locked} />
          <DayCloseButton closed={closed} />
        </div>
      </div>
      {branch.pos_locked && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          الكاشير مقفل حالياً — لا يمكن إتمام أي بيع جديد حتى تفتحه.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="الطلبات" value={String(glance.orders)} />
        <Stat label="الإيراد" value={money(glance.revenue, currency)} />
        <Stat label="كاش" value={money(glance.cash, currency)} />
        <Stat label="بطاقة" value={money(glance.card, currency)} />
      </div>
      {openShifts > 0 && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          وردية مفتوحة الآن ({openShifts}).
        </p>
      )}

      {/* فروقات الدرج */}
      <Section title="فروقات الدرج (الورديات المُغلقة)">
        {shiftVars.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {shiftVars.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[#5b4636]">{s.employee_name}</span>
                <span className="text-xs text-neutral-400">{timeAr(s.closed_at)}</span>
                <span className={s.variance === 0 ? "text-emerald-600" : s.variance < 0 ? "text-red-600 font-semibold" : "text-amber-600"}>
                  {s.variance > 0 ? "+" : ""}{money(s.variance, currency)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* فروقات المخزون */}
      <Section title="فروقات الجرد">
        {stockVars.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {stockVars.map((s, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[#5b4636]">{s.material_name}</span>
                <span className="text-xs text-neutral-400">{timeAr(s.created_at)}</span>
                <span className={vColor(s.variance_pct)}>
                  {s.variance > 0 ? "+" : ""}{s.variance} ({s.variance_pct ?? 0}%)
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* الشاذّ */}
      <Section title="الأحداث الحسّاسة">
        {exceptions.length === 0 ? (
          <Empty />
        ) : (
          <ul className="divide-y divide-neutral-100">
            {exceptions.map((e, i) => (
              <li key={i} className="flex items-center justify-between py-2 text-sm">
                <span className="text-[#5b4636]">
                  {auditActionLabel(e.action)}
                  {e.user_name && <span className="text-xs text-neutral-400"> · {e.user_name}</span>}
                </span>
                <span className="text-xs text-neutral-400">{timeAr(e.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-3 text-center">
      <div className="text-lg font-bold text-[#5b4636]">{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h3 className="mb-2 text-sm font-semibold text-neutral-700">{title}</h3>
      {children}
    </section>
  );
}

function Empty() {
  return <p className="text-sm text-neutral-400">لا شيء.</p>;
}
