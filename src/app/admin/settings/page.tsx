import { db } from "@/lib/supabase";
import { saveSetting } from "../actions";

export const dynamic = "force-dynamic";

/** الأرقام السبعة + إعدادات الفاتورة. كلها تُعدَّل هنا بلا نشر كود. */
const FIELDS: { key: string; label: string; kind: "text" | "number"; hint?: string }[] = [
  { key: "shop_name", label: "اسم المحل", kind: "text" },
  { key: "shop_phone", label: "هاتف المحل", kind: "text" },
  { key: "currency", label: "رمز العملة", kind: "text" },
  { key: "extra_shot_price", label: "سعر الشوت الإضافي", kind: "number" },
  { key: "shot_grams", label: "غرامات الشوت", kind: "number" },
  { key: "variance_alert_pct", label: "عتبة إنذار الفرق %", kind: "number", hint: "المرحلة ٢" },
  { key: "stamps_for_free", label: "أختام المشروب المجاني", kind: "number", hint: "المرحلة ٤" },
  { key: "stamp_cap_per_order", label: "سقف الأختام للفاتورة", kind: "number", hint: "المرحلة ٤" },
  { key: "free_drink_max_price", label: "سقف قيمة المجاني", kind: "number", hint: "المرحلة ٤" },
  { key: "stamp_daily_limit", label: "حدّ الأختام اليومي", kind: "number", hint: "المرحلة ٤" },
  { key: "stamp_expiry_days", label: "انتهاء الأختام (يوم)", kind: "number", hint: "المرحلة ٤" },
];

export default async function SettingsPage() {
  const { data } = await db.from("settings").select("key, value");
  const map = new Map((data ?? []).map((r) => [r.key as string, (r as { value: unknown }).value]));

  function current(key: string, kind: "text" | "number"): string {
    const v = map.get(key);
    if (kind === "number") {
      if (Array.isArray(v) && typeof v[0] === "number") return String(v[0]);
      if (typeof v === "number") return String(v);
      return "";
    }
    return typeof v === "string" ? v : "";
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink/60 mb-3 leading-7">
        «الأرقام السبعة» محفوظة هنا. القيم الحالية افتراضات مبدئية — عدّلها متى ما حسمتها.
      </p>
      {FIELDS.map((f) => (
        <form key={f.key} action={saveSetting} className="card p-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="key" value={f.key} />
          <input type="hidden" name="kind" value={f.kind} />
          <label className="min-w-40 flex-1">
            <span className="text-sm text-ink/60">
              {f.label}
              {f.hint ? ` · ${f.hint}` : ""}
            </span>
            <input
              name="value"
              type={f.kind === "number" ? "number" : "text"}
              step={f.kind === "number" ? "any" : undefined}
              defaultValue={current(f.key, f.kind)}
              className="input mt-1"
            />
          </label>
          <button className="btn text-sm">حفظ</button>
        </form>
      ))}
    </div>
  );
}
