import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { money, timeAr } from "@/lib/format";
import { eventMeta } from "@/lib/events";
import {
  getShiftDetail,
  getShiftMovements,
  getShiftOrders,
  getShiftEvents,
} from "@/lib/shift-detail";

/**
 * تفصيل وردية — الشاشة التي تجيب «من، ومتى، وليش».
 *
 * الفرق وحده لا يعني شيئاً: −٥٬٠٠٠ قد تكون خطأ في العدّ، أو باقياً لم
 * يُسلَّم، أو سحباً غير مسجّل. هذه الشاشة تعرض كل ما جرى في الوردية
 * بترتيبه حتى يحكم المالك بنفسه — النظام يكشف، ولا يتّهم.
 */
export const dynamic = "force-dynamic";

const MOVE_LABEL: Record<string, string> = {
  OPENING: "فكّة افتتاحية",
  SALE: "بيع نقدي",
  REFUND: "إرجاع لزبون",
  EXPENSE: "مصروف",
  DROP: "سحب أثناء الوردية",
  REMOVAL: "سحب مبيعات",
};

const TYPE_LABEL: Record<string, string> = {
  SALE: "بيع",
  LOYALTY_REWARD: "مكافأة ولاء",
  STAFF_DRINK: "مشروب موظف",
  COMPLIMENTARY: "مجاني",
};

export default async function ShiftPage({ params }: { params: { id: string } }) {
  const user = currentUser()!;
  if (!(await can(user, "cash.view_expected"))) {
    return (
      <div className="card p-8 text-center">
        <p className="font-semibold text-red-600">هذه الشاشة تعرض أرقام الدرج — للمالك فقط.</p>
        <Link href="/manage" className="btn-ghost mt-4 inline-block px-6 py-2">← لوحة الإدارة</Link>
      </div>
    );
  }

  const [branch, settings] = await Promise.all([getActiveBranch(user.bid), getSettings()]);
  const currency = strSetting(settings, "currency", "د.ع");
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  const shift = await getShiftDetail(branch.id, params.id);
  if (!shift) notFound();

  const [movements, orders, events] = await Promise.all([
    getShiftMovements(shift.id),
    getShiftOrders(shift.id),
    getShiftEvents(branch.id, shift.opened_at, shift.closed_at),
  ]);

  const variance = shift.variance ?? 0;
  const isShort = variance < 0;
  const live = orders.filter((o) => !["VOIDED", "CANCELLED"].includes(o.status));
  const voided = orders.filter((o) => o.status === "VOIDED");

  // تتبّع الرصيد المتوقّع حركةً بحركة — هكذا وصلنا للرقم النهائي.
  let running = shift.opening_float;
  const trail = movements.map((m) => {
    running += m.amount;
    return { ...m, running };
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/manage" className="text-sm text-muted hover:text-ink">← لوحة الإدارة</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">
          وردية {shift.employee_name}
        </h1>
        <p className="mt-1 text-sm text-muted">
          يوم <span className="nums">{shift.business_day}</span> · فُتحت{" "}
          <span className="nums">{timeAr(shift.opened_at)}</span>
          {shift.closed_at && (
            <> وأُغلقت <span className="nums">{timeAr(shift.closed_at)}</span></>
          )}
          {shift.status === "OPEN" && <span className="chip mr-2 bg-accent/15 text-accentdeep">ما زالت مفتوحة</span>}
        </p>
      </div>

      {/* الحكم على الوردية */}
      {shift.status === "CLOSED" && (
        <div
          className={`card p-5 ${
            variance === 0 ? "border-emerald-200 bg-emerald-50/40" : "border-red-200 bg-red-50/40"
          }`}
        >
          {variance === 0 ? (
            <>
              <p className="font-display text-lg font-bold text-emerald-800">الدرج مضبوط ✅</p>
              <p className="mt-1 text-sm text-emerald-900/70">
                المعدود يطابق المتوقّع بالضبط. لا شيء يحتاج نظرك في هذه الوردية.
              </p>
            </>
          ) : (
            <>
              <p className="font-display text-lg font-bold text-red-800">
                {isShort ? "نقص" : "زيادة"} {money(Math.abs(variance), currency)}
              </p>
              <p className="mt-1 text-sm text-red-900/70">
                {isShort
                  ? "الدرج فيه أقلّ ممّا يجب. الأسباب المعتادة: خطأ في العدّ · باقٍ زائد لزبون · بيع لم يُسجَّل · سحب بلا تسجيل."
                  : "الدرج فيه أكثر ممّا يجب. الأسباب المعتادة: خطأ في العدّ · باقٍ لم يُعطَ لزبون · فكّة أُضيفت بلا تسجيل."}
              </p>
              <p className="mt-2 text-sm text-red-900/70">
                اقرأ سلسلة الحركات تحت — إن كانت كلها سليمة فالفرق في العدّ أو في بيع غير مسجّل.
              </p>
            </>
          )}
        </div>
      )}

      {/* كيف وصلنا للرقم */}
      <section className="card p-5">
        <h2 className="mb-1 font-display font-bold text-ink">كيف حُسب المتوقّع</h2>
        <p className="mb-4 text-xs text-muted">
          الفكّة الافتتاحية ليست إيراداً — هي مالك الذي وضعته في الدرج ليبدأ اليوم.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              <tr className="border-b border-line">
                <td className="py-2 text-muted">الفكّة الافتتاحية</td>
                <td className="py-2 text-muted"></td>
                <td className="nums py-2 text-left font-medium text-ink">
                  {money(shift.opening_float, currency)}
                </td>
              </tr>
              {trail.map((m, i) => (
                <tr key={i} className="border-b border-line/60">
                  <td className="py-2 text-ink">{MOVE_LABEL[m.kind] ?? m.kind}</td>
                  <td className="nums py-2 text-xs text-muted">
                    {timeAr(m.at)}
                    {m.reason ? ` · ${m.reason}` : ""}
                  </td>
                  <td
                    className={`nums py-2 text-left font-medium ${
                      m.amount < 0 ? "text-red-600" : "text-emerald-700"
                    }`}
                  >
                    {m.amount > 0 ? "+" : ""}
                    {money(m.amount, currency)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-line">
                <td className="py-2 font-semibold text-ink">المتوقّع في الدرج</td>
                <td></td>
                <td className="nums py-2 text-left font-display font-bold text-ink">
                  {money(shift.expected_cash ?? running, currency)}
                </td>
              </tr>
              {shift.counted_cash != null && (
                <>
                  <tr>
                    <td className="py-2 text-ink">المعدود فعلاً</td>
                    <td className="py-2 text-xs text-muted">أدخله {shift.employee_name} بلا رؤية المتوقّع</td>
                    <td className="nums py-2 text-left font-medium text-ink">
                      {money(shift.counted_cash, currency)}
                    </td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="py-2 font-semibold text-ink">الفرق</td>
                    <td></td>
                    <td
                      className={`nums py-2 text-left font-display font-bold ${
                        variance === 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {variance > 0 ? "+" : ""}
                      {money(variance, currency)}
                    </td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* الطلبات */}
      <section className="card p-5">
        <h2 className="mb-3 font-display font-bold text-ink">
          طلبات الوردية <span className="nums text-sm font-normal text-muted">({live.length})</span>
        </h2>
        {orders.length === 0 ? (
          <p className="py-4 text-sm text-muted">لا طلبات في هذه الوردية.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.order_number}
                    className={`border-b border-line/60 ${
                      ["VOIDED", "CANCELLED"].includes(o.status) ? "opacity-50 line-through" : ""
                    }`}
                  >
                    <td className="nums py-2 font-semibold text-ink">#{o.order_number}</td>
                    <td className="nums py-2 text-xs text-muted">{timeAr(o.at)}</td>
                    <td className="py-2 text-muted">{TYPE_LABEL[o.order_type] ?? o.order_type}</td>
                    <td className="py-2 text-xs text-muted">
                      {o.method === "cash" ? "نقد" : o.method === "card" ? "بطاقة" : o.method === "loyalty" ? "مكافأة" : "—"}
                    </td>
                    <td className="nums py-2 text-left font-medium text-ink">
                      {money(o.total, currency)}
                      {o.refunded > 0 && (
                        <span className="mr-1 text-xs text-red-600">−{money(o.refunded, currency)}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {voided.length > 0 && (
          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <span className="nums font-semibold">{voided.length}</span> فاتورة ملغاة في هذه الوردية —
            الملغى لا يُحتسب بيعاً ولا يدخل الدرج.
          </p>
        )}
      </section>

      {/* ما جرى خلال الوردية */}
      <section className="card p-5">
        <h2 className="mb-1 font-display font-bold text-ink">ما جرى خلال الوردية</h2>
        <p className="mb-3 text-xs text-muted">
          كل عملية حسّاسة وقعت بين فتح الوردية وإغلاقها.
        </p>
        {events.length === 0 ? (
          <p className="py-4 text-sm text-muted">لا أحداث مسجّلة.</p>
        ) : (
          <ul className="divide-y divide-line">
            {events.map((e, i) => {
              const meta = eventMeta(e.action);
              return (
                <li key={i} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{meta.label}</span>
                    <span className="nums text-xs text-muted">{timeAr(e.at)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {e.user_name ?? "—"}
                    {e.approved_by_name ? ` · بموافقة ${e.approved_by_name}` : ""}
                    {e.reason ? ` · ${e.reason}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
