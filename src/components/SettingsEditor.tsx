"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateSettingsAction } from "@/app/manage/settings-actions";

type Initial = {
  shop_name: string;
  shop_phone: string;
  standard_float: number;
  staff_drink_limit: number;
  extra_shot_price: number;
  shot_grams: number;
  session_timeout_minutes: number;
  variance_green: number;
  variance_amber: number;
  low_stock_alert: boolean;
};

export default function SettingsEditor({ initial }: { initial: Initial }) {
  const router = useRouter();
  const [f, setF] = useState<Initial>(initial);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function set<K extends keyof Initial>(k: K, v: Initial[K]) {
    setF((p) => ({ ...p, [k]: v }));
    setSaved(false);
  }

  function save() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await updateSettingsAction({
        shop_name: f.shop_name,
        shop_phone: f.shop_phone,
        standard_float: Math.round(Number(f.standard_float) || 0),
        staff_drink_limit: Math.round(Number(f.staff_drink_limit) || 0),
        extra_shot_price: Math.round(Number(f.extra_shot_price) || 0),
        shot_grams: Math.round(Number(f.shot_grams) || 0),
        session_timeout_minutes: Math.round(Number(f.session_timeout_minutes) || 0),
        variance_thresholds: { green: Number(f.variance_green) || 0, amber: Number(f.variance_amber) || 0 },
        low_stock_alert: !!f.low_stock_alert,
      });
      if (res.ok) { setSaved(true); router.refresh(); }
      else setError(res.error);
    });
  }

  return (
    <div className="space-y-5">
      <h2 className="font-display text-lg font-bold text-ink">الإعدادات</h2>

      <section className="card space-y-4 p-5">
        <Text label="اسم المحل (على الفاتورة)" value={f.shop_name} onChange={(v) => set("shop_name", v)} />
        <Text label="هاتف المحل (على الفاتورة)" value={f.shop_phone} onChange={(v) => set("shop_phone", v)} dir="ltr" />
      </section>

      <section className="card space-y-4 p-5">
        <Num label="الفكّة الافتتاحية القياسية" value={f.standard_float} onChange={(v) => set("standard_float", v)} hint="المبلغ الذي يُقترح في بداية كل وردية" />
        <Num label="مشروبات الموظف المجانية باليوم" value={f.staff_drink_limit} onChange={(v) => set("staff_drink_limit", v)} hint="فوقها تحتاج موافقتك" />
        <Num label="سعر الشوت الإضافي" value={f.extra_shot_price} onChange={(v) => set("extra_shot_price", v)} />
        <Num label="غرامات الشوت الواحد" value={f.shot_grams} onChange={(v) => set("shot_grams", v)} />
        <Num label="قفل تلقائي بعد خمول (دقائق)" value={f.session_timeout_minutes} onChange={(v) => set("session_timeout_minutes", v)} />
      </section>

      <section className="card space-y-4 p-5">
        <h3 className="font-display text-sm font-bold text-ink">عتبات فرق المخزون (%)</h3>
        <p className="text-xs text-muted">أخضر حتى «الأول»، أصفر حتى «الثاني»، أحمر فوقه.</p>
        <div className="grid grid-cols-2 gap-3">
          <Num label="حدّ الأخضر" value={f.variance_green} onChange={(v) => set("variance_green", v)} />
          <Num label="حدّ الأصفر" value={f.variance_amber} onChange={(v) => set("variance_amber", v)} />
        </div>
        <label className="flex items-center justify-between pt-2">
          <span className="text-sm text-ink">تنبيه المخزون المنخفض</span>
          <input type="checkbox" checked={f.low_stock_alert} onChange={(e) => set("low_stock_alert", e.target.checked)} className="h-5 w-5 accent-[#A66A4C]" />
        </label>
      </section>

      {error && <div className="text-center text-sm text-red-600">{error}</div>}
      {saved && <div className="text-center text-sm text-accentdeep">تم الحفظ ✅</div>}

      <button onClick={save} disabled={pending} className="btn-primary w-full">
        {pending ? "..." : "حفظ"}
      </button>
    </div>
  );
}

function Text({ label, value, onChange, dir }: { label: string; value: string; onChange: (v: string) => void; dir?: "ltr" | "rtl" }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} className="field" dir={dir} />
    </label>
  );
}

function Num({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-muted">{label}</span>
      <input type="number" inputMode="numeric" value={value} onChange={(e) => onChange(Number(e.target.value))} className="field nums" dir="ltr" />
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
