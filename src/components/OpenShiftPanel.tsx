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
    if (!Number.isFinite(n) || n < 0) {
      setError("أدخل مبلغ الفكّة");
      return;
    }
    setError(null);
    start(async () => {
      const res = await openShiftAction(n);
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10" dir="rtl">
      <h1 className="mb-1 text-center text-2xl font-bold text-[#5b4636]">افتح الوردية</h1>
      <p className="mb-8 text-center text-sm text-neutral-500">أهلاً {userName} · أدخل الفكّة الافتتاحية</p>

      <label className="mb-2 block text-sm text-neutral-600">الفكّة الافتتاحية</label>
      <input
        type="number"
        inputMode="numeric"
        value={float}
        onChange={(e) => {
          setFloat(e.target.value);
          setError(null);
        }}
        className="mb-2 w-full rounded-lg border border-neutral-200 px-4 py-3 text-center text-xl"
        dir="ltr"
      />
      <p className="mb-4 text-center text-xs text-neutral-400">
        القياسي: {money(standardFloat, currency)}
      </p>

      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}

      <button
        onClick={open}
        disabled={pending}
        className="w-full rounded-xl bg-[#8a6a4f] py-4 text-lg font-semibold text-white active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "..." : "بدء الوردية"}
      </button>
    </main>
  );
}
