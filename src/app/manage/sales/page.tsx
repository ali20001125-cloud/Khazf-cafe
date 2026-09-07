import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { productSalesMonthly } from "@/lib/reports";
import { money } from "@/lib/format";

/**
 * معدّل بيع كل مشروب شهرياً.
 *
 * لماذا شهرياً لا يومياً: المالك يشتري الحبوب والحليب مقدّماً، فسؤاله
 * الحقيقي «كم أبيع من هذا في الشهر، وكم أحتاج أن أشتري؟» — لا «كم بعت
 * اليوم». والمتوسّط اليومي يجيب «كم يكفيني المخزون».
 */
export const dynamic = "force-dynamic";

export default async function SalesPage() {
  const user = currentUser()!;
  if (!(await can(user, "reports.financial"))) {
    return <p className="card p-8 text-center text-red-600">لا تملك صلاحية التقارير المالية.</p>;
  }

  const [branch, settings] = await Promise.all([getActiveBranch(user.bid), getSettings()]);
  const currency = strSetting(settings, "currency", "د.ع");
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  const rows = await productSalesMonthly(branch.id, 6);

  // تجميع حسب الشهر
  const months = [...new Set(rows.map((r) => r.month))];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/manage" className="text-sm text-muted hover:text-ink">← لوحة الإدارة</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">مبيعات المشروبات</h1>
        <p className="mt-1 text-sm text-muted">
          آخر ستّة أشهر. الفواتير الملغاة والمشروبات المجانية خارج الحساب.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-display font-bold text-ink">لا مبيعات بعد</p>
          <p className="mt-1 text-sm text-muted">
            سيظهر هنا معدّل بيع كل مشروب فور تسجيل أول فواتير.
          </p>
        </div>
      ) : (
        months.map((m) => {
          const list = rows.filter((r) => r.month === m);
          const total = list.reduce((s, r) => s + r.revenue, 0);
          const qty = list.reduce((s, r) => s + r.qty, 0);
          return (
            <section key={m} className="card p-5">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display font-bold text-ink">
                  <span className="nums">{m}</span>
                </h2>
                <span className="nums text-sm text-muted">
                  {qty} مشروب · {money(total, currency)}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-right text-xs text-muted">
                      <th className="pb-2 font-medium">المشروب</th>
                      <th className="pb-2 font-medium">الكمية</th>
                      <th className="pb-2 font-medium">متوسّط يومي</th>
                      <th className="pb-2 font-medium">الإيراد</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r) => (
                      <tr key={r.product_id} className="border-b border-line/60">
                        <td className="py-2.5 font-medium text-ink">{r.product_name}</td>
                        <td className="nums py-2.5 text-ink">{r.qty}</td>
                        <td className="nums py-2.5 text-muted">{r.avg_per_day}</td>
                        <td className="nums py-2.5 text-ink">{money(r.revenue, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}

      <p className="rounded-xl bg-sand p-4 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-ink">كيف تستفيد من «المتوسّط اليومي»:</span> لو كان
        لاتيه ٨ في اليوم وكل واحد يأخذ ١٨ غراماً، فاستهلاكك اليومي من الحبوب ≈ ١٤٤ غراماً —
        أي كيلو يكفي أسبوعاً تقريباً. هذا ما يحدّد متى تشتري وكم.
      </p>
    </div>
  );
}
