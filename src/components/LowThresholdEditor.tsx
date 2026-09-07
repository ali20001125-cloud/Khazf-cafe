"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inputUnit, toBase } from "@/lib/labels";
import { setLowThresholdAction } from "@/app/manage/actions";

/**
 * «نبّهني إذا قلّ عن…» — بدل تسمية «عتبة المخزون» التي لا تعني شيئاً
 * لصاحب مقهى. رقم واحد بلغة واضحة: متى تريد أن يذكّرك النظام بالشراء.
 */
export default function LowThresholdEditor({
  materialId,
  baseUnit,
  current,
}: {
  materialId: string;
  baseUnit: "g" | "ml" | "pcs";
  current: number;
}) {
  const router = useRouter();
  const u = inputUnit(baseUnit);
  const [value, setValue] = useState(String(current / u.factor || ""));
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return setError("رقم غير صالح");
    setError(null);
    start(async () => {
      const r = await setLowThresholdAction(materialId, toBase(n, baseUnit));
      if (!r.ok) return setError(r.error);
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    });
  }

  return (
    <section className="card p-5">
      <h2 className="font-display font-bold text-ink">نبّهني إذا قلّ عن</h2>
      <p className="mb-3 mt-0.5 text-xs text-muted">
        عندما ينزل الرصيد تحت هذا الرقم يظهر تنبيه في المخزون والصفحة الرئيسية،
        فتشتري قبل أن ينفد لا بعده. اتركه صفراً لتعطيل التنبيه.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="number"
          inputMode="decimal"
          dir="ltr"
          className="field nums w-32 text-center"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
            setError(null);
          }}
        />
        <span className="text-sm text-muted">{u.label}</span>
        <button onClick={save} disabled={pending} className="btn-ghost px-5 py-2.5 text-sm">
          {pending ? "…" : "حفظ"}
        </button>
        {saved && <span className="text-sm text-emerald-700">تم ✅</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </section>
  );
}
