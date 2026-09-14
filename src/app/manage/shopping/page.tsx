import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { shoppingList } from "@/lib/inventory-overview";
import { stockLabel, num } from "@/lib/format";
import ShoppingListView from "@/components/ShoppingListView";

/**
 * قائمة الشراء.
 *
 * الشاشة تجيب سؤالاً واحداً يُسأل قبل كل خروج إلى السوق: **ماذا أشتري
 * وكم؟** — وبوحدة الشراء لا بالغرام، لأن أحداً لا يشتري ٢١٨٠ غراماً.
 */
export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "inventory.view"))) redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  const rows = await shoppingList(user.bid, 14);
  const needed = rows.filter((r) => r.urgency !== "ok");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-display text-2xl font-bold text-ink">قائمة الشراء</h1>
        <p className="mt-1 text-sm text-muted">
          محسوبة من الاستهلاك الفعلي في آخر ١٤ يوماً ومن الحدّ الذي حدّدته لكل
          مادة. الكمية بوحدة الشراء ومُقرَّبة لأعلى — نصف كرتون لا يُشترى.
        </p>
      </header>

      {needed.length === 0 ? (
        <div className="card border-emerald-200 bg-emerald-50/40 p-6 text-center">
          <p className="font-display font-bold text-emerald-800">لا شيء ناقص</p>
          <p className="mt-1 text-sm text-emerald-900/70">
            كل مادة فوق حدّها. راجع{" "}
            <Link href="/manage/inventory" className="underline">
              المخزون
            </Link>{" "}
            لضبط الحدود إن كانت الأرقام لا تشبه واقعك.
          </p>
        </div>
      ) : (
        <ShoppingListView rows={needed} />
      )}

      <section className="card p-5">
        <h2 className="mb-2 font-display text-sm font-bold text-ink">كيف تُحسب</h2>
        <ul className="space-y-1.5 text-sm text-muted">
          <li>
            <span className="font-semibold text-ink">نفد</span> — الرصيد صفر. لا
            يُباع ما يعتمد عليه أصلاً.
          </li>
          <li>
            <span className="font-semibold text-ink">قلّ</span> — تحت حدّ التنبيه
            الذي حدّدته.
          </li>
          <li>
            <span className="font-semibold text-ink">أكمِل</span> — فوق حدّ
            التنبيه لكنه دون «المطلوب بعد الشراء».
          </li>
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          «أيام متبقّية» تقدير من معدّل الاستهلاك، لا وعد: يوم عطلة أو حفلة
          يغيّره. اقرأه كترتيب أولويات لا كموعد.
        </p>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 font-display text-sm font-bold text-ink">كل المواد</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-line text-right text-xs text-muted">
                <th className="pb-2 font-medium">المادة</th>
                <th className="pb-2 font-medium">الرصيد</th>
                <th className="pb-2 font-medium">حدّ التنبيه</th>
                <th className="pb-2 font-medium">المطلوب</th>
                <th className="pb-2 font-medium">يومياً</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.material_id}>
                  <td className="py-2 font-medium text-ink">{r.name}</td>
                  <td className="nums py-2 text-muted">{stockLabel(r.stock, r.base_unit)}</td>
                  <td className="nums py-2 text-muted">
                    {r.low_threshold > 0 ? stockLabel(r.low_threshold, r.base_unit) : "—"}
                  </td>
                  <td className="nums py-2 text-muted">
                    {r.par_level > 0 ? stockLabel(r.par_level, r.base_unit) : "—"}
                  </td>
                  <td className="nums py-2 text-muted">
                    {r.avg_per_day > 0 ? `${num(r.avg_per_day)}` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted">
          «المطلوب» فارغ يعني بلا اقتراح شراء لهذه المادة. اضبطه من{" "}
          <Link href="/manage/inventory" className="text-accent underline">
            المخزون
          </Link>
          .
        </p>
      </section>
    </div>
  );
}
