import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { exceptions, EXCEPTION_LABELS, type ExceptionRow } from "@/lib/orders-admin";
import { money, timeAr } from "@/lib/format";

/**
 * لوحة الاستثناءات (المواصفة §56 · §57).
 *
 * الفكرة: المالك لا يقرأ كل العمليات — يقرأ ما شذّ فقط.
 * والتسمية مقصودة: **فرق غير مُفسَّر**، لا «سرقة». النظام يكتشف الفرق
 * ولا يعرف سببه.
 */
export const dynamic = "force-dynamic";

export default async function ExceptionsPage() {
  const user = currentUser()!;
  if (!(await can(user, "reports.view"))) {
    return <p className="card p-8 text-center text-red-600">لا تملك صلاحية عرض التقارير.</p>;
  }

  const [branch, settings] = await Promise.all([getActiveBranch(user.bid), getSettings()]);
  const currency = strSetting(settings, "currency", "د.ع");
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  const rows = await exceptions(branch.id);
  const high = rows.filter((r) => r.severity === "high");
  const medium = rows.filter((r) => r.severity !== "high");

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-ink">الشاذّ</h1>
        <p className="mt-1 text-sm text-muted">آخر ٣٠ يوماً — ما يستحقّ نظرك فقط.</p>
      </header>

      {rows.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 text-2xl">
            ✓
          </div>
          <p className="mt-3 font-display font-bold text-ink">لا شيء شاذّ</p>
          <p className="mt-1 text-sm text-muted">الفروقات والإلغاءات والإرجاعات كلها ضمن المعتاد.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {high.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-ink">
                <span className="h-2 w-2 rounded-full bg-red-500" />
                يحتاج نظرك ({high.length})
              </h2>
              <div className="space-y-2">
                {high.map((r, i) => (
                  <Card key={i} row={r} currency={currency} />
                ))}
              </div>
            </section>
          )}

          {medium.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 font-display font-bold text-ink">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                للمتابعة ({medium.length})
              </h2>
              <div className="space-y-2">
                {medium.map((r, i) => (
                  <Card key={i} row={r} currency={currency} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <p className="mt-6 rounded-xl bg-sand p-4 text-xs leading-relaxed text-muted">
        النظام يعرض <span className="font-semibold text-ink">فرقاً غير مُفسَّر</span>، لا اتّهاماً.
        الفرق قد يكون خطأ عدّ أو نسيان تسجيل هدر أو غير ذلك — العتبة تنبيه، وليست
        كمية هدر مسموحة.
      </p>
    </div>
  );
}

function Card({ row, currency }: { row: ExceptionRow; currency: string }) {
  const label = EXCEPTION_LABELS[row.kind] ?? row.kind;
  const d = row.detail ?? {};

  return (
    <div
      className={`card p-4 ${row.severity === "high" ? "border-red-200 bg-red-50/40" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-display font-bold text-ink">{label}</span>
        <span className="nums text-xs text-muted">{row.at ? timeAr(row.at) : ""}</span>
      </div>

      <p className="mt-1.5 text-sm text-muted">{describe(row.kind, d, currency)}</p>

      {row.user_name && (
        <p className="mt-1 text-xs text-muted">الموظف: {row.user_name}</p>
      )}
    </div>
  );
}

/** وصف بشري لكل نوع — لا JSON خام أمام المالك. */
function describe(kind: string, d: Record<string, unknown>, currency: string): string {
  const n = (k: string) => Number(d[k] ?? 0);
  const s = (k: string) => String(d[k] ?? "");

  switch (kind) {
    case "cash_variance": {
      const v = n("variance");
      return `${v < 0 ? "نقص" : "زيادة"} ${money(Math.abs(v), currency)} — المعدود ${money(
        n("actual"),
        currency
      )} مقابل متوقّع ${money(n("expected"), currency)}.`;
    }
    case "inventory_variance": {
      const doses = d["doses"] ? ` ≈ ${d["doses"]} جرعة` : "";
      return `${s("material")}: ${n("variance")} (${d["pct"] ?? "—"}٪)${doses}.`;
    }
    case "repeated_variance":
      return `${s("material")}: نقص في ${n("times")} جرد بمجموع ${n(
        "total"
      )} — نمط متكرّر، لا حادثة.`;
    case "order_voided":
      return `فاتورة #${n("order_number")} بمبلغ ${money(n("total"), currency)} — ${s("reason")}`;
    case "refund":
      return `${money(n("amount"), currency)} — ${s("reason")}`;
    case "no_sale_open":
      return s("reason") || "بلا سبب مذكور";
    case "high_waste":
      return `${s("material")}: ${n("qty")} في يوم واحد.`;
    case "excessive_discounts":
      return `${n("count")} خصماً بمجموع ${money(n("total"), currency)} خلال أسبوع.`;
    case "unusual_staff_drinks":
      return `${n("count")} مشروب موظف خلال أسبوع.`;
    case "unusual_loyalty_redemptions":
      return `${n("count")} مكافأة مصروفة خلال أسبوع.`;
    default:
      return "";
  }
}
