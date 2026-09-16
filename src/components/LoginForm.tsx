"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/login/actions";

/**
 * الدخول بالرمز وحده.
 *
 * كانت الشاشة تعرض قائمة الأسماء وأدوارها. فمن أمسك الجهاز عرف أنّ ثمّة
 * حساب مالك وما اسمه — نصف الاقتحام معرفةُ الباب. والباريستا كان يقرأ
 * كل صباح أنّ فوقه حساباً رمزُه هو نفسه رمز الموافقة على الإلغاء.
 *
 * والرموز فريدة، فالرمز وحده يعرّف صاحبه. ولا إرسال تلقائيّ عند الرقم
 * الرابع: الرموز قد تكون أربعةً أو ستّة، وإرسالٌ يخمّن الطول يُنتج
 * خطأً كاذباً لمن رمزه أطول — فزرّ «دخول» يحسم.
 */
export default function LoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (pending || pin.length < 4) return;
    start(async () => {
      const res = await loginAction(pin);
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      if (res.reason === "locked") setError(`محاولات كثيرة — انتظر ${res.minutes} دقيقة`);
      else if (res.reason === "bad_pin") setError(`رمز غير صحيح — تبقّى ${res.remaining} محاولة`);
      else setError("رمز غير صحيح");
      setPin("");
    });
  }

  function press(d: string) {
    if (pending) return;
    setError(null);
    setPin((p) => (p + d).slice(0, 6));
  }

  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

  return (
    <div>
      {/* النقاط تنمو مع الرمز ولا تُفشي طوله قبل أن يُكتب */}
      <div className="mb-5 flex justify-center gap-2.5" dir="ltr">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full transition-colors ${
              i < pin.length ? "bg-accent" : "bg-line"
            } ${i >= 4 && pin.length <= 4 ? "opacity-30" : ""}`}
          />
        ))}
      </div>

      <div
        className={`mb-4 min-h-[1.25rem] text-center text-sm ${error ? "text-red-600" : "text-transparent"}`}
        role="status"
        aria-live="polite"
      >
        {error ?? "."}
      </div>

      <div className="nums grid grid-cols-3 gap-2.5" dir="ltr">
        {pad.map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            disabled={pending}
            className="tap rounded-xl2 border border-line bg-sand/60 py-5 font-display text-2xl font-bold text-ink hover:border-accent/40 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => { setPin(""); setError(null); }}
          disabled={pending || pin.length === 0}
          className="tap rounded-xl2 py-5 text-sm text-muted disabled:opacity-30"
        >
          مسح
        </button>
        <button
          onClick={() => press("0")}
          disabled={pending}
          className="tap rounded-xl2 border border-line bg-sand/60 py-5 font-display text-2xl font-bold text-ink hover:border-accent/40 disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={submit}
          disabled={pending || pin.length < 4}
          className="btn-primary py-5 text-lg disabled:opacity-40"
        >
          {pending ? "…" : "دخول"}
        </button>
      </div>
    </div>
  );
}
