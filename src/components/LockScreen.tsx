"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { unlockScreenAction } from "@/app/pos/lock-actions";

/**
 * شاشة القفل.
 *
 * تُعرض من طريقين:
 *   • **حيّاً** فوق الشاشة العاملة (`IdleLock`) — فتبقى السلّة المفتوحة
 *     تحتها في الذاكرة وتعود كما هي بعد الفتح.
 *   • **من الخادم** عند تحديث صفحةٍ وجلستُها موسومةٌ مقفلة — وحينها لا
 *     يُرسَل المحتوى أصلاً، فلا شيء تحتها ليُقرأ.
 */
export default function LockScreen({
  userName,
  onUnlocked,
}: {
  userName: string;
  onUnlocked?: () => void;
}) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy || pin.length < 4) return;
    setBusy(true);
    setError(null);
    const r = await unlockScreenAction(pin);
    setBusy(false);
    if (r.ok) {
      // بلا مناوِل: هذه نسخة الخادم — التحديث يُعيد بناء الصفحة مفتوحةً
      if (onUnlocked) onUnlocked();
      else router.refresh();
      return;
    }
    if (r.reason === "locked") setError(`محاولات كثيرة — انتظر ${r.minutes} دقيقة`);
    else if (r.reason === "bad_pin") setError(`رمز غير صحيح — تبقّى ${r.remaining} محاولة`);
    else setError("رمز غير صحيح");
    setPin("");
  }

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p + d).slice(0, 6));
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-dark px-6">
      <div className="font-display text-4xl font-bold text-cream">خزف</div>
      <p className="mt-3 text-sm text-cream/60">الشاشة مقفلة</p>
      <p className="mt-1 text-xs text-cream/35">
        كانت مفتوحة باسم {userName} — أدخل رمزك للمتابعة
      </p>

      <div className="mt-7 flex justify-center gap-2.5" dir="ltr">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full ${i < pin.length ? "bg-accent" : "bg-cream/20"} ${
              i >= 4 && pin.length <= 4 ? "opacity-30" : ""
            }`}
          />
        ))}
      </div>

      <div
        className={`mt-3 min-h-[1.25rem] text-center text-sm ${error ? "text-red-400" : "text-transparent"}`}
        role="status"
        aria-live="polite"
      >
        {error ?? "."}
      </div>

      <div className="nums mt-2 grid w-full max-w-[17rem] grid-cols-3 gap-2.5" dir="ltr">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            disabled={busy}
            className="tap rounded-xl2 border border-cream/15 bg-cream/5 py-4 font-display text-2xl font-bold text-cream disabled:opacity-40"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => { setPin(""); setError(null); }}
          disabled={busy || pin.length === 0}
          className="tap rounded-xl2 py-4 text-sm text-cream/50 disabled:opacity-30"
        >
          مسح
        </button>
        <button
          onClick={() => press("0")}
          disabled={busy}
          className="tap rounded-xl2 border border-cream/15 bg-cream/5 py-4 font-display text-2xl font-bold text-cream disabled:opacity-40"
        >
          0
        </button>
        <button
          onClick={submit}
          disabled={busy || pin.length < 4}
          className="btn-primary py-4 text-base disabled:opacity-40"
        >
          {busy ? "…" : "فتح"}
        </button>
      </div>

      <p className="mt-7 max-w-xs text-center text-[0.7rem] leading-relaxed text-cream/30">
        طلبك المفتوح محفوظ في الشاشة ولم يُرسل. يعود كما هو بمجرّد الفتح.
      </p>
    </div>
  );
}
