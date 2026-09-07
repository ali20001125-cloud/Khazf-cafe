import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import { getSettings, strSetting } from "@/lib/settings";
import { money, timeAr } from "@/lib/format";
import { eventMeta } from "@/lib/events";
import {
  todayGlance, recentShiftVariances, recentStockVariances, recentExceptions,
  salesLast7Days, topProductsToday,
} from "@/lib/reports";
import DayCloseButton from "@/components/DayCloseButton";
import LockToggle from "@/components/LockToggle";

/**
 * لوحة المالك.
 *
 * قاعدة هذه الشاشة: **كل رقم أو تنبيه يؤدّي إلى مكان يشرحه**. الرقم وحده
 * لا يفيد المالك — «نقص ٥٬٠٠٠» بلا سياق يترك سؤالاً مفتوحاً، فكل بطاقة
 * هنا رابط إلى الشاشة التي تفصّل ما جرى.
 */
export const dynamic = "force-dynamic";

export default async function Overview() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "reports.financial"))) redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="text-red-600">لا يوجد فرع فعّال.</p>;
  const settings = await getSettings();
  const currency = strSetting(settings, "currency", "د.ع");

  const [glance, series, top, shiftVars, stockVars, events, shift] = await Promise.all([
    todayGlance(branch.id),
    salesLast7Days(branch.id),
    topProductsToday(branch.id),
    recentShiftVariances(branch.id, 6),
    recentStockVariances(branch.id, 6),
    recentExceptions(user.bid, 40),
    getOpenShift(branch.id),
  ]);

  // ما يحتاج نظر المالك فعلاً — كل عنصر بوجهة يشرحه
  const attention: { text: string; href: string }[] = [];
  for (const s of shiftVars) {
    if (s.variance !== 0 && s.business_day === glance.businessDay) {
      attention.push({
        text: `${s.variance < 0 ? "نقص" : "زيادة"} ${money(Math.abs(s.variance), currency)} في درج ${s.employee_name}`,
        href: `/manage/shifts/${s.id}`,
      });
    }
  }
  for (const v of stockVars.filter((x) => x.level === "over_threshold")) {
    attention.push({
      text: `فرق مخزون في ${v.material_name}: ${v.variance}`,
      href: "/manage/inventory",
    });
  }
  if (glance.voided > 0) {
    attention.push({ text: `${glance.voided} فاتورة ملغاة اليوم`, href: "/manage/orders" });
  }
  if (glance.refunded > 0) {
    attention.push({
      text: `إرجاعات اليوم ${money(glance.refundsTotal, currency)}`,
      href: "/manage/orders",
    });
  }

  const max = Math.max(1, ...series.map((s) => s.total));
  const week = series.reduce((a, s) => a + s.total, 0);
  const bigEvents = events.filter((e) => eventMeta(e.action).tone === "high").slice(0, 6);

  return (
    <div className="space-y-6">
      {/* الرأس */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">نظرة عامة</h1>
          <p className="mt-1 text-sm text-muted">
            اليوم المحاسبي <span className="nums">{glance.businessDay}</span>
            {glance.closed && <span className="chip mr-2 bg-dark/5 text-muted">مُغلق</span>}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {shift ? (
              <Link href={`/manage/shifts/${shift.id}`} className="chip bg-accent/12 text-accentdeep">
                وردية مفتوحة · {shift.employee_name} ←
              </Link>
            ) : (
              <span className="chip bg-dark/5 text-muted">لا وردية مفتوحة</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LockToggle locked={branch.pos_locked} />
          <DayCloseButton closed={glance.closed} />
        </div>
      </div>

      {branch.pos_locked && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="font-semibold">الكاشير مقفل.</span> لا يستطيع الباريستا فتح فاتورة جديدة
          حتى تفتحه — الطلب الجاري وقت القفل يُكمَّل عادةً.
        </p>
      )}

      {/* ما يحتاج نظرك — كل سطر رابط */}
      {attention.length === 0 ? (
        <div className="card border-emerald-200 bg-emerald-50/40 p-4">
          <p className="font-display font-bold text-emerald-800">اليوم تمام ✅</p>
          <p className="mt-0.5 text-sm text-emerald-900/70">
            لا فروقات في الدرج ولا في المخزون، ولا إلغاءات ولا إرجاعات.
          </p>
        </div>
      ) : (
        <div className="card border-amber-200 bg-amber-50/50 p-4">
          <p className="font-display font-bold text-amber-900">
            <span className="nums">{attention.length}</span> أمر يحتاج نظرك
          </p>
          <ul className="mt-2 space-y-1.5">
            {attention.map((a, i) => (
              <li key={i}>
                <Link
                  href={a.href}
                  className="flex items-center justify-between rounded-lg bg-cream/70 px-3 py-2 text-sm text-ink hover:bg-cream"
                >
                  <span>{a.text}</span>
                  <span className="text-xs text-accent">افتح ←</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* أرقام اليوم */}
      <div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="طلبات اليوم" value={String(glance.orders)} href="/manage/orders" accent />
          <Kpi label="إيراد اليوم" value={money(glance.revenue, currency)} href="/manage/orders" accent />
          <Kpi label="كاش" value={money(glance.cash, currency)} href="/manage/orders" />
          <Kpi label="بطاقة" value={money(glance.card, currency)} href="/manage/orders" />
        </div>
        <p className="mt-2 text-xs text-muted">
          الإيراد = مجموع فواتير البيع المكتملة. الفكّة الافتتاحية ليست إيراداً، والفاتورة
          الملغاة خارج كل هذه الأرقام.
        </p>
      </div>

      {/* حالة الدرج */}
      {(glance.expectedCash > 0 || glance.actualCash > 0) && (
        <section className="card p-5">
          <h2 className="mb-3 font-display text-sm font-bold text-ink">درج اليوم</h2>
          <div className="grid grid-cols-3 gap-3">
            <Mini label="المتوقّع" value={money(glance.expectedCash, currency)} />
            <Mini label="المعدود" value={money(glance.actualCash, currency)} />
            <Mini
              label="الفرق"
              value={`${glance.cashVariance > 0 ? "+" : ""}${money(glance.cashVariance, currency)}`}
              tone={glance.cashVariance === 0 ? "good" : "bad"}
            />
          </div>
        </section>
      )}

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
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-sm font-bold text-ink">الأكثر مبيعاً اليوم</h2>
            <Link href="/manage/sales" className="text-xs text-accent">شهرياً ←</Link>
          </div>
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

      {/* الفروقات والأحداث */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="فروقات الدرج" hint="اضغط الوردية لترى ما جرى فيها">
          {shiftVars.length === 0 ? (
            <Empty text="لا ورديات مُغلقة بعد." />
          ) : (
            <ul className="divide-y divide-line">
              {shiftVars.map((s) => (
                <li key={s.id}>
                  <Link href={`/manage/shifts/${s.id}`} className="flex items-center justify-between py-2.5 hover:opacity-70">
                    <span className="text-sm">
                      <span className="text-ink">{s.employee_name}</span>
                      <span className="nums block text-[11px] text-muted">
                        {s.business_day} · {s.orders_count} طلب
                      </span>
                    </span>
                    <span
                      className={`nums text-sm ${
                        s.variance === 0 ? "text-emerald-600" : "font-semibold text-red-600"
                      }`}
                    >
                      {s.variance > 0 ? "+" : ""}
                      {money(s.variance, currency)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="فروقات الجرد" hint="الفرق بين المعدود والمتوقّع">
          {stockVars.length === 0 ? (
            <Empty text="لا فروقات مسجّلة." />
          ) : (
            <ul className="divide-y divide-line">
              {stockVars.map((s, i) => (
                <li key={i}>
                  <Link href="/manage/inventory" className="flex items-center justify-between py-2.5 hover:opacity-70">
                    <span className="text-sm">
                      <span className="text-ink">{s.material_name}</span>
                      {s.equivalent_doses != null && Number(s.equivalent_doses) >= 1 && (
                        <span className="nums block text-[11px] text-amber-700">
                          ≈ {s.equivalent_doses} جرعة
                        </span>
                      )}
                    </span>
                    <span
                      className={`nums text-sm ${
                        s.level === "over_threshold" ? "font-semibold text-red-600" : "text-amber-600"
                      }`}
                    >
                      {s.variance > 0 ? "+" : ""}
                      {s.variance}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="أحداث تستحقّ النظر" hint="العمليات التي تمسّ المال أو الصلاحيات">
          {bigEvents.length === 0 ? (
            <Empty text="لا أحداث حسّاسة." />
          ) : (
            <ul className="divide-y divide-line">
              {bigEvents.map((e) => {
                const meta = eventMeta(e.action);
                return (
                  <li key={e.id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-ink">{meta.label}</span>
                      <span className="nums text-[11px] text-muted">{timeAr(e.created_at)}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted">
                      {e.user_name ?? "—"}
                      {e.reason ? ` · ${e.reason}` : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href="/manage/exceptions" className="mt-3 block text-xs text-accent">
            كل الأحداث والشاذّ ←
          </Link>
        </Section>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: string;
  href: string;
  accent?: boolean;
}) {
  return (
    <Link href={href} className={`card p-4 transition-colors hover:border-accent/40 ${accent ? "border-accent/25" : ""}`}>
      <div className="text-xs text-muted">{label}</div>
      <div className="nums mt-1 font-display text-2xl font-bold text-ink">{value}</div>
    </Link>
  );
}

function Mini({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-xl bg-sand p-3">
      <div className="text-xs text-muted">{label}</div>
      <div
        className={`nums mt-0.5 font-display text-lg font-bold ${
          tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600" : "text-ink"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h3 className="font-display text-sm font-bold text-ink">{title}</h3>
      {hint && <p className="mb-2 mt-0.5 text-[11px] text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-4 text-sm text-muted">{text}</p>;
}
