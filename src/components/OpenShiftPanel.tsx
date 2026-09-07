"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { openShiftAction } from "@/app/pos/shift-actions";

/**
 * فتح الوردية.
 *
 * **الفكّة مقفلة**: يحدّدها المالك من الإعدادات، والباريستا يؤكّد أنها
 * موجودة في الدرج فقط. لو تُرك الرقم مفتوحاً لصار بابين للتلاعب: يرفع
 * الفكّة فيبتلع الفرق، أو يخفضها فتظهر زيادة وهمية. تأكيد الوجود مسؤولية،
 * وإدخال الرقم صلاحية.
 */
export default function OpenShiftPanel({
  standardFloat,
  currency,
  userName,
  canEditFloat = false,
}: {
  standardFloat: number;
  currency: string;
  userName: string;
  /** المالك وحده يعدّل الفكّة عند الفتح؛ الباريستا يؤكّدها كما هي. */
  canEditFloat?: boolean;
}) {
  const router = useRouter();
  const [float, setFloat] = useState<string>(String(standardFloat));
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open() {
    if (pending) return;
    const n = canEditFloat ? Number(float) : standardFloat;
    if (!Number.isFinite(n) || n < 0) return setError("أدخل مبلغ الفكّة");
    if (!canEditFloat && !confirmed) return setError("أكّد أن الفكّة موجودة في الدرج");
    setError(null);
    start(async () => {
      const res = await openShiftAction(n);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <main className="flex min-h-screen flex-col">
      <div className="topbar px-5 pb-14 pt-4" dir="rtl">
        <Link href="/" className="tap chip border border-cream/20 bg-cream/5 text-cream/80">
          → الرئيسية
        </Link>
        <div className="mt-8 text-center">
          <div className="font-display text-3xl font-bold text-cream">افتح الوردية</div>
          <p className="mt-2 text-sm text-cream/60">أهلاً {userName}</p>
        </div>
      </div>

      <div className="mx-auto -mt-8 w-full max-w-sm px-6">
        <div className="card p-6 shadow-lift">
          {canEditFloat ? (
            <>
              <label className="mb-2 block text-sm text-muted">الفكّة الافتتاحية</label>
              <input
                type="number"
                inputMode="numeric"
                value={float}
                onChange={(e) => {
                  setFloat(e.target.value);
                  setError(null);
                }}
                className="field nums text-center text-2xl"
                dir="ltr"
              />
              <p className="nums mt-2 text-center text-xs text-muted">
                القياسي من الإعدادات: {money(standardFloat, currency)}
              </p>
            </>
          ) : (
            <>
              <p className="text-center text-sm text-muted">الفكّة الافتتاحية</p>
              <p className="nums mt-2 text-center font-display text-4xl font-bold text-ink">
                {money(standardFloat, currency)}
              </p>
              <p className="mt-2 text-center text-xs text-muted">
                يحدّدها المالك — لا تُعدَّل من هنا.
              </p>

              <button
                type="button"
                onClick={() => {
                  setConfirmed((c) => !c);
                  setError(null);
                }}
                className={`tap mt-5 flex w-full items-center gap-3 rounded-xl border p-4 text-right ${
                  confirmed ? "border-emerald-300 bg-emerald-50" : "border-line bg-cream"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border text-sm ${
                    confirmed ? "border-emerald-500 bg-emerald-500 text-white" : "border-line"
                  }`}
                >
                  {confirmed ? "✓" : ""}
                </span>
                <span className="text-sm text-ink">
                  عددت الدرج، وفيه {money(standardFloat, currency)}
                </span>
              </button>

              <p className="mt-2 text-center text-[11px] text-muted">
                إن كان المبلغ مختلفاً، راجع المالك قبل البدء.
              </p>
            </>
          )}

          {error && <div className="mt-3 text-center text-sm text-red-600">{error}</div>}

          <button onClick={open} disabled={pending} className="btn-primary mt-5 w-full text-lg">
            {pending ? "..." : "بدء الوردية"}
          </button>
        </div>
      </div>
    </main>
  );
}
