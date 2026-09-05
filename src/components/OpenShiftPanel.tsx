"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { openShiftAction } from "@/app/pos/shift-actions";

export default function OpenShiftPanel({
  standardFloat,
  currency,
  userName,
}: {
  standardFloat: number;
  currency: string;
  userName: string;
}) {
  const router = useRouter();
  const [float, setFloat] = useState<string>(String(standardFloat));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open() {
    if (pending) return;
    const n = Number(float);
    if (!Number.isFinite(n) || n < 0) return setError("أدخل مبلغ الفكّة");
    setError(null);
    start(async () => {
      const res = await openShiftAction(n);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="topbar px-6 pb-14 pt-16 text-center">
        <div className="font-display text-3xl font-bold text-cream">افتح الوردية</div>
        <p className="mt-2 text-sm text-cream/60">أهلاً {userName} — أدخل الفكّة الافتتاحية</p>
      </div>
      <div className="mx-auto -mt-8 w-full max-w-sm px-6">
        <div className="card p-6 shadow-lift">
          <label className="mb-2 block text-sm text-muted">الفكّة الافتتاحية</label>
          <input
            type="number" inputMode="numeric" value={float}
            onChange={(e) => { setFloat(e.target.value); setError(null); }}
            className="field nums text-center text-2xl" dir="ltr"
          />
          <p className="nums mt-2 text-center text-xs text-muted">القياسي: {money(standardFloat, currency)}</p>
          {error && <div className="mt-3 text-center text-sm text-red-600">{error}</div>}
          <button onClick={open} disabled={pending} className="btn-primary mt-5 w-full text-lg">
            {pending ? "..." : "بدء الوردية"}
          </button>
        </div>
      </div>
    </main>
  );
}
