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
 *
 * والاسم مملوءٌ سلفاً بصاحب الجلسة: هو الغالب أن يعود. لكنه **يُعدَّل**،
 * فالمالك قد يأتي ليفتح على جهاز الباريستا — وهذا ما طلبه صراحةً.
 */
export default function LockScreen({
  userName,
  onUnlocked,
}: {
  userName: string;
  onUnlocked?: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(userName);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const ready = name.trim().length > 0 && code.trim().length >= 4;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setError(null);
    const r = await unlockScreenAction(name, code);
    setBusy(false);
    if (r.ok) {
      // بلا مناوِل: هذه نسخة الخادم — التحديث يُعيد بناء الصفحة مفتوحةً
      if (onUnlocked) onUnlocked();
      else router.refresh();
      return;
    }
    if (r.reason === "locked") setError(`محاولات كثيرة — انتظر ${r.minutes} دقيقة`);
    else if (r.reason === "bad_pin")
      setError(`الاسم أو الرمز غير صحيح — تبقّى ${r.remaining} محاولة`);
    else setError("الاسم أو الرمز غير صحيح");
    setCode("");
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-dark px-6">
      <div className="font-display text-4xl font-bold text-cream">خزف</div>
      <p className="mt-3 text-sm text-cream/60">الشاشة مقفلة</p>

      <form onSubmit={submit} className="mt-7 w-full max-w-[19rem] space-y-3">
        <input
          className="w-full rounded-xl border border-cream/15 bg-cream/5 px-4 py-3 text-cream outline-none placeholder:text-cream/30 focus:border-accent"
          aria-label="الاسم"
          autoComplete="username"
          autoCapitalize="off"
          placeholder="الاسم"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          disabled={busy}
        />
        <input
          className="w-full rounded-xl border border-cream/15 bg-cream/5 px-4 py-3 text-cream outline-none placeholder:text-cream/30 focus:border-accent"
          aria-label="الرمز"
          type="password"
          autoComplete="current-password"
          autoCapitalize="off"
          spellCheck={false}
          dir="ltr"
          placeholder="الرمز"
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          disabled={busy}
          autoFocus
        />

        <div
          className={`min-h-[1.25rem] text-center text-sm ${error ? "text-red-400" : "text-transparent"}`}
          role="status"
          aria-live="polite"
        >
          {error ?? "."}
        </div>

        <button type="submit" disabled={busy || !ready} className="btn-primary w-full py-4 disabled:opacity-40">
          {busy ? "…" : "فتح"}
        </button>
      </form>

      <p className="mt-7 max-w-xs text-center text-[0.7rem] leading-relaxed text-cream/30">
        طلبك المفتوح محفوظ في الشاشة ولم يُرسل. يعود كما هو بمجرّد الفتح.
      </p>
    </div>
  );
}
