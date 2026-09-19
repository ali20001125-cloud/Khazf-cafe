import { Fragment } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { money, num, countAr } from "@/lib/format";
import {
  dayProfit, netProfit, profitIsComplete, productProfit, profitTrend,
  retailDay, retailProfit, retailVariants,
} from "@/lib/profit";

/**
 * الأرباح (§37).
 *
 * الشاشة تجيب سؤالاً واحداً: **كم بقي في الجيب؟** لا «كم بعت».
 * وتقول صراحةً ما لا تعرفه: الفواتير التي لا تكلفة مختومة لها تُستثنى،
 * والشاشة تُعلن ذلك بدل أن تُنقص الربح بصمت.
 */
export const dynamic = "force-dynamic";

export default async function ProfitPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "reports.financial"))) redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  const settings = await getSettings();
  const currency = strSetting(settings, "currency", "د.ع");

  const [today, byProduct, trend, retail, byRetail, byVariant] = await Promise.all([
    dayProfit(branch.id),
    productProfit(user.bid, 30),
    profitTrend(branch.id, 14),
    retailDay(branch.id),
    retailProfit(user.bid, 30),
    retailVariants(user.bid, 30),
  ]);

  const net = netProfit(today);
  const complete = profitIsComplete(today);
  const marginPct =
    today.revenueCosted > 0 ? Math.round((net / today.revenueCosted) * 1000) / 10 : null;
  const uncosted = today.ordersTotal - today.ordersCosted;
  // المجاميع على المشروبات المختومة وحدها — ما لا تكلفة له لا يدخل جمعاً
  const monthProfit = byProduct.reduce((a, p) => a + (p.profit ?? 0), 0);
  const monthRevenue = byProduct.reduce((a, p) => a + (p.revenue ?? 0), 0);
  const uncostedCups = byProduct.reduce((a, p) => a + (p.cups - p.costed_cups), 0);
  const trendMax = Math.max(1, ...trend.map((t) => Math.max(t.revenue, 0)));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">الأرباح</h1>
        <p className="mt-1 text-sm text-muted">
          اليوم المحاسبي <span className="nums">{today.businessDay}</span> — الإيراد
          ما دخل الصندوق، والربح ما بقي بعد ثمن ما استُهلك.
        </p>
      </header>

      {uncosted > 0 && (
        <div className="card border-amber-200 bg-amber-50/60 p-4">
          <p className="font-display font-bold text-amber-900">
            <span className="nums">{uncosted}</span> من{" "}
            <span className="nums">{today.ordersTotal}</span> فاتورة بلا تكلفة مسجّلة
          </p>
          <p className="mt-1 text-sm text-amber-900/80">
            هذه فواتير من قبل تشغيل ختم التكلفة. لا نعرف كم كلّفت يومها، واختراع
            رقم لها أسوأ من الإقرار بجهله — فهي مستثناة، والربح المعروض **حدّ
            أدنى** لا رقماً نهائياً. الحساب الدقيق من اليوم فصاعداً.
          </p>
        </div>
      )}

      {/* ربح اليوم */}
      <section>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Card label="إيراد اليوم" value={money(today.revenue, currency)} hint="بعد الإرجاعات" />
          <Card label="تكلفة ما بيع" value={money(today.cogsSales, currency)} hint="قهوة وحليب وكوب" />
          <Card
            label={complete ? "الربح" : "الربح (جزئي)"}
            value={marginPct !== null ? money(net, currency) : "—"}
            hint={
              marginPct !== null
                ? complete
                  ? `${marginPct}٪ من الإيراد`
                  : `${marginPct}٪ — على ${today.ordersCosted} من ${today.ordersTotal} فاتورة`
                : "لا فاتورة مختومة التكلفة بعد"
            }
            tone={marginPct === null ? undefined : net >= 0 ? "good" : "bad"}
          />
          <Card
            label="ضاع بلا بيع"
            value={money(today.wasteCost + today.cogsFree, currency)}
            hint={`هدر ${money(today.wasteCost, currency)} · مجاني ${money(today.cogsFree, currency)}`}
            tone={today.wasteCost + today.cogsFree > 0 ? "warn" : undefined}
          />
        </div>

        <div className="card mt-3 p-4">
          <h2 className="mb-2 font-display text-sm font-bold text-ink">كيف وصلنا للرقم</h2>
          <ul className="space-y-1.5 text-sm">
            <Line
              label={
                complete
                  ? "الإيراد (فواتير البيع)"
                  : `إيراد الفواتير المختومة (${today.ordersCosted} من ${today.ordersTotal})`
              }
              value={today.revenueCosted}
              currency={currency}
            />
            {today.refunds > 0 && (
              <Line label="ناقص ما أُرجع للزبائن" value={-today.refunds} currency={currency} />
            )}
            <Line label="ناقص تكلفة مواد ما بيع" value={-today.cogsSales} currency={currency} />
            {today.cogsFree > 0 && (
              <Line
                label={`ناقص مشروبات مجانية (${today.freeDrinks})`}
                value={-today.cogsFree}
                currency={currency}
              />
            )}
            {today.wasteCost > 0 && (
              <Line label="ناقص الهدر المسجَّل" value={-today.wasteCost} currency={currency} />
            )}
            <li className="flex justify-between border-t border-line pt-1.5 font-display font-bold text-ink">
              <span>الباقي</span>
              <span className={`nums ${net >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                {money(net, currency)}
              </span>
            </li>
          </ul>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            هذا ربح المشروبات وحده — لم يُخصَم منه إيجار ولا كهرباء ولا رواتب.
            يقيس جودة التسعير والاستهلاك، لا نتيجة المقهى كاملةً.
          </p>
        </div>
      </section>

      {/* اتجاه أسبوعين */}
      <section className="card p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="font-display text-sm font-bold text-ink">آخر ١٤ يوماً</h2>
          <span className="text-xs text-muted">الغامق = الربح داخل الإيراد</span>
        </div>
        <div className="flex h-32 items-end gap-1">
          {trend.map((t) => {
            const rev = Math.max(0, t.revenue);
            const pro = Math.max(0, t.profit);
            return (
              <div key={t.day} className="group relative flex flex-1 flex-col justify-end">
                <div
                  className="w-full rounded-t bg-accent/25"
                  style={{ height: `${(rev / trendMax) * 100}%` }}
                >
                  <div
                    className="w-full rounded-t bg-accent"
                    style={{ height: rev > 0 ? `${(pro / rev) * 100}%` : "0%" }}
                  />
                </div>
                <span className="sr-only">
                  {t.day}: إيراد {rev}، ربح {pro}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted">
          <span className="nums">{trend[0]?.day ?? ""}</span>
          <span className="nums">{trend[trend.length - 1]?.day ?? ""}</span>
        </div>
      </section>

      {/*
        البضاعة في قسمٍ مستقلّ.
        ربح الكيس وربح اللاتيه رقمان مختلفان تماماً — هذا يبيع بـ٢٥ ألفاً
        ويكلّف ٧٬٥٠٠، وذاك يبيع بخمسة ويكلّف أقلّ من ألف. جمعُهما يُنتج
        «هامشاً» لا يصف أيّاً منهما، فلا يُبنى عليه قرار.
      */}
      {(retail.orders > 0 || byRetail.length > 0) && (
        <section className="card p-5">
          <div className="mb-1 flex items-baseline justify-between">
            <h2 className="font-display text-sm font-bold text-ink">البضاعة — اليوم</h2>
            <span className="nums text-xs text-muted">
              {retail.orders > 0
                ? `${countAr(retail.orders, "طلباً", "طلبين", "طلبات")} · ${countAr(retail.units, "قطعة", "قطعتين", "قطع")}`
                : "لا بيع اليوم"}
            </span>
          </div>
          <p className="mb-3 text-xs text-muted">
            أكياس البنّ والأدوات — معزولةٌ عن المشروبات لأن هامشهما مختلف،
            وجمعُهما يُخفي أيّهما يكسب.
          </p>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Card label="إيراد البضاعة" value={money(retail.revenue, currency)} />
            <Card label="تكلفة ما بيع" value={money(retail.cogs, currency)} />
            <Card
              label="تغليف الطلبات"
              value={money(retail.packagingCost, currency)}
              hint={`${money(retail.packagingEach, currency)} للطلب الواحد`}
            />
            <Card
              label="ربح البضاعة"
              value={money(retail.profit, currency)}
              tone={retail.profit >= 0 ? "good" : "bad"}
            />
          </div>

          {byRetail.length > 0 && (
            <>
              <h3 className="mb-1 mt-5 text-xs font-semibold text-muted">
                كل صنف ونوع — ٣٠ يوماً (بلا التغليف، فهو للطلب لا للصنف)
              </h3>
              <p className="mb-2 text-xs text-muted/80">
                الأنواع مفصولة لا مجموعة: «٣ أكياس» لا تقول أيّ بنٍّ تطلب في
                الشحنة القادمة، و«كالدي ٢ · سيرادو ١» تقول.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[420px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-line text-right text-xs text-muted">
                      <th className="p-2 font-medium">الصنف والنوع</th>
                      <th className="p-2 font-medium">بيع</th>
                      <th className="p-2 font-medium">الإيراد</th>
                      <th className="p-2 font-medium">الربح</th>
                      <th className="p-2 font-medium">الهامش</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byRetail.map((r) => {
                      const kinds = byVariant.filter((v) => v.product_id === r.product_id);
                      return (
                        <Fragment key={r.product_id}>
                          <tr className="border-b border-line/60 bg-sand/40">
                            <td className="p-2 font-semibold text-ink">{r.name}</td>
                            <td className="nums p-2 text-muted">{num(r.units)}</td>
                            <td className="nums p-2 text-muted">{money(r.revenue, currency)}</td>
                            <td className="nums p-2 font-semibold text-ink">
                              {money(r.profit, currency)}
                            </td>
                            <td className="nums p-2 text-muted">
                              {r.margin_pct == null ? "—" : `${r.margin_pct}٪`}
                            </td>
                          </tr>
                          {/* نوعٌ واحد لا يُفصَل عن نفسه — السطر فوقه هو هو */}
                          {kinds.length > 1 &&
                            kinds.map((v) => (
                              <tr
                                key={`${r.product_id}-${v.variant_id ?? "none"}`}
                                className="border-b border-line/40"
                              >
                                <td className="py-1.5 pr-6 text-muted">
                                  {kindName(v.variant_name)}
                                </td>
                                <td className="nums py-1.5 pr-2 text-ink">{num(v.units)}</td>
                                <td className="nums py-1.5 pr-2 text-muted">
                                  {money(v.revenue, currency)}
                                </td>
                                <td className="nums py-1.5 pr-2 text-muted">
                                  {money(v.profit, currency)}
                                </td>
                                <td className="nums py-1.5 pr-2 text-muted">
                                  {v.margin_pct == null ? "—" : `${v.margin_pct}٪`}
                                </td>
                              </tr>
                            ))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}

      {/* ربح كل مشروب */}
      <section className="card p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-display text-sm font-bold text-ink">ربح كل مشروب — ٣٠ يوماً</h2>
          <Link href="/manage/sales" className="navlink text-xs text-accent">
            عدد المبيعات ←
          </Link>
        </div>
        <p className="mb-3 text-xs text-muted">
          مرتّبة بالربح لا بعدد الأكواب: مشروب يُباع أكثر قد يربّح أقلّ.
        </p>

        {byProduct.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">لا مبيعات في آخر ٣٠ يوماً.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead>
                <tr className="border-b border-line text-right text-xs text-muted">
                  <th className="pb-2 font-medium">المشروب</th>
                  <th className="pb-2 font-medium">أكواب</th>
                  <th className="pb-2 font-medium">إيراد</th>
                  <th className="pb-2 font-medium">تكلفة</th>
                  <th className="pb-2 font-medium">ربح</th>
                  <th className="pb-2 font-medium">ربح الكوب</th>
                  <th className="pb-2 font-medium">الهامش</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {byProduct.map((p) => (
                  <tr key={p.product_id}>
                    <td className="py-2.5 font-medium text-ink">{p.name}</td>
                    <td className="nums py-2.5 text-muted">
                      {num(p.cups)}
                      {p.costed_cups < p.cups && (
                        <span className="mr-1 text-[10px] text-amber-700">
                          ({num(p.costed_cups)} بتكلفة)
                        </span>
                      )}
                    </td>
                    <td className="nums py-2.5 text-muted">
                      {p.revenue !== null ? money(p.revenue, currency) : "—"}
                    </td>
                    <td className="nums py-2.5 text-muted">
                      {p.cogs !== null ? money(p.cogs, currency) : "—"}
                    </td>
                    <td className="nums py-2.5 font-semibold text-ink">
                      {p.profit !== null ? money(p.profit, currency) : "—"}
                    </td>
                    <td className="nums py-2.5 text-ink">
                      {p.profit_per_cup !== null ? money(p.profit_per_cup, currency) : "—"}
                    </td>
                    <td className="nums py-2.5">
                      {p.margin_pct !== null ? (
                        <span
                          className={
                            p.margin_pct >= 60
                              ? "text-emerald-700"
                              : p.margin_pct >= 40
                                ? "text-amber-700"
                                : "text-red-600"
                          }
                        >
                          {p.margin_pct}٪
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-line font-display font-bold text-ink">
                  <td className="pt-2.5">المجموع</td>
                  <td className="nums pt-2.5">{num(byProduct.reduce((a, p) => a + p.cups, 0))}</td>
                  <td className="nums pt-2.5">{money(monthRevenue, currency)}</td>
                  <td className="nums pt-2.5">{money(monthRevenue - monthProfit, currency)}</td>
                  <td className="nums pt-2.5">{money(monthProfit, currency)}</td>
                  <td colSpan={2} className="nums pt-2.5">
                    {monthRevenue > 0
                      ? `${Math.round((monthProfit / monthRevenue) * 1000) / 10}٪`
                      : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs leading-relaxed text-muted">
          تكلفة الفاتورة تُوزَّع على أكوابها بنسبة السعر، فربح مشروبٍ في فاتورة
          مشتركة تقديرٌ قريب لا رقم مطلق. والمشروبات المجانية داخلة في التكلفة
          وخارجة من الإيراد — لأنها كذلك فعلاً.
          {uncostedCups > 0 && (
            <>
              {" "}
              و<span className="nums">{num(uncostedCups)}</span> كوباً بيع قبل تشغيل ختم
              التكلفة، فيُعرض عدده ولا يُعرض له ربح: «—» تعني «لا نعرف»، وهي أصدق من
              رقمٍ واثقٍ خاطئ.
            </>
          )}
        </p>
      </section>
    </div>
  );
}

/**
 * «بن كالدي — للبيع» ← «بن كالدي».
 *
 * اللاحقة تفيد في المخزون حيث يجاور بنُّ البيع بنَّ المحل، فلا تُحذف من
 * الاسم. لكنها هنا تحت عنوان «البضاعة» تكرارٌ يزاحم ما يُقرأ: النوع.
 */
function kindName(name: string): string {
  return name.replace(/\s*—\s*للبيع\s*$/, "");
}

function Card({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "warn";
}) {
  const color =
    tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-600"
      : tone === "warn" ? "text-amber-700" : "text-ink";
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`nums mt-1 font-display text-xl font-bold ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

function Line({ label, value, currency }: { label: string; value: number; currency: string }) {
  return (
    <li className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`nums ${value < 0 ? "text-red-600" : "text-ink"}`}>
        {value < 0 ? "−" : ""}
        {money(Math.abs(value), currency)}
      </span>
    </li>
  );
}
