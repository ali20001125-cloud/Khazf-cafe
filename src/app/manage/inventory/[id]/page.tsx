import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings, strSetting } from "@/lib/settings";
import { getMaterial, materialLedger, MOVE_LABELS } from "@/lib/inventory-overview";
import { money, stockLabel, timeAr } from "@/lib/format";
import { inputUnit } from "@/lib/labels";
import LowThresholdEditor from "@/components/LowThresholdEditor";

/**
 * تفصيل مادة واحدة — «كيف وصلنا لهذا الرصيد».
 *
 * هذه الشاشة تجيب سؤال المالك حرفياً: وضعت ٥ كيلو، بعنا ١٫٥، بقي ٣٫٥،
 * أضفت ١ فصار ٤٫٥. كل سطر يعرض الحركة **والرصيد بعدها**، فتُقرأ السلسلة
 * من الأسفل للأعلى كقصّة.
 */
export const dynamic = "force-dynamic";

export default async function MaterialPage({ params }: { params: { id: string } }) {
  const user = currentUser()!;
  if (!(await can(user, "inventory.view"))) {
    return <p className="card p-8 text-center text-red-600">لا تملك صلاحية عرض المخزون.</p>;
  }

  const [material, settings] = await Promise.all([
    getMaterial(user.bid, params.id),
    getSettings(),
  ]);
  if (!material) notFound();
  const currency = strSetting(settings, "currency", "د.ع");

  const lines = await materialLedger(material.id, 80);
  const u = inputUnit(material.base_unit);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/manage/inventory" className="text-sm text-muted hover:text-ink">← المخزون</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">{material.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="الرصيد الحالي" value={stockLabel(material.stock, material.base_unit)} big />
        <Stat label={`التكلفة لكل ${u.label}`} value={money(material.current_cost * u.factor, currency)} />
        <Stat label="قيمة المخزون" value={money(material.stock * material.current_cost, currency)} />
      </div>

      <LowThresholdEditor
        materialId={material.id}
        baseUnit={material.base_unit}
        current={material.low_threshold}
      />

      <section className="card p-5">
        <h2 className="font-display font-bold text-ink">كيف وصلنا لهذا الرصيد</h2>
        <p className="mb-4 mt-0.5 text-xs text-muted">
          كل سطر يعرض الحركة والرصيد بعدها مباشرة. الأحدث أولاً — اقرأ من الأسفل
          للأعلى لتتابع القصّة من البداية.
        </p>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">لا حركات على هذه المادة بعد.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-right text-xs text-muted">
                  <th className="pb-2 font-medium">الوقت</th>
                  <th className="pb-2 font-medium">الحركة</th>
                  <th className="pb-2 font-medium">التفصيل</th>
                  <th className="pb-2 font-medium">الكمية</th>
                  <th className="pb-2 font-medium">الرصيد بعدها</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-b border-line/60">
                    <td className="nums py-2.5 text-xs text-muted">{timeAr(l.at)}</td>
                    <td className="py-2.5">
                      <span
                        className={`chip ${
                          l.qty_delta > 0 ? "bg-emerald-50 text-emerald-800" : "bg-dark/5 text-muted"
                        }`}
                      >
                        {MOVE_LABELS[l.kind] ?? l.kind}
                      </span>
                    </td>
                    <td className="py-2.5 text-xs text-muted">
                      {l.order_number ? `فاتورة #${l.order_number}` : l.reason || "—"}
                      {l.user_name && <span className="block">{l.user_name}</span>}
                    </td>
                    <td
                      className={`nums py-2.5 font-medium ${
                        l.qty_delta > 0 ? "text-emerald-700" : "text-red-600"
                      }`}
                    >
                      {l.qty_delta > 0 ? "+" : ""}
                      {l.qty_delta}
                    </td>
                    <td className="nums py-2.5 font-semibold text-ink">
                      {stockLabel(l.running_balance, material.base_unit)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="rounded-xl bg-sand p-4 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-ink">لماذا لا يمكن تعديل الرصيد مباشرة:</span> الرصيد
        هنا ليس رقماً مخزّناً بل مجموع الحركات. لو أُتيح تعديله بيد أحد لأمكن إخفاء نقص بضغطة.
        التصحيح يكون بجرد يسجّل الفرق، أو بشراء يسجّل الوارد — وكلاهما يظهر في هذه القائمة باسم
        من سجّله ووقته.
      </p>
    </div>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`nums mt-1 font-display font-bold text-ink ${big ? "text-2xl" : "text-lg"}`}>
        {value}
      </p>
    </div>
  );
}
