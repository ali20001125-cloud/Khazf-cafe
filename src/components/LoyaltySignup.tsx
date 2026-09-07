"use client";

import { useState } from "react";
import { sendCode, confirmCode } from "@/app/loyalty/actions";

/**
 * تسجيل الزبون بنفسه (المواصفة §37).
 * ثلاث خطوات: الرقم ← الرمز ← تمّ. بلا حساب، بلا كلمة مرور، بلا موظف.
 */

type Step = "phone" | "code" | "done";

export default function LoyaltySignup({
  shopName,
  stampsPerReward,
}: {
  shopName: string;
  stampsPerReward: number;
}) {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [result, setResult] = useState<{ stamps: number; rewards: number; isNew: boolean } | null>(null);

  async function onSendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await sendCode(phone);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.devCode) setHint(`وضع التطوير — الرمز: ${r.devCode}`);
    setStep("code");
  }

  async function onConfirm(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await confirmCode(phone, code, name);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResult({ stamps: r.stamps, rewards: r.rewards, isNew: r.isNew });
    setStep("done");
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    const r = await sendCode(phone);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    if (r.devCode) setHint(`وضع التطوير — الرمز: ${r.devCode}`);
    setCode("");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-10" dir="rtl">
      <header className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-dark text-3xl">
          ☕
        </div>
        <h1 className="mt-4 font-display text-2xl font-bold text-ink">{shopName}</h1>
        <p className="mt-1 text-sm text-muted">
          كل <span className="nums font-semibold">{stampsPerReward}</span> مشروبات = مشروب مجاني
        </p>
      </header>

      {step === "phone" && (
        <form onSubmit={onSendCode} className="card mt-8 space-y-4 p-5">
          <div>
            <label htmlFor="phone" className="mb-1.5 block text-sm font-semibold text-ink">
              رقم الهاتف
            </label>
            <input
              id="phone"
              className="field nums text-lg"
              inputMode="tel"
              autoComplete="tel"
              placeholder="07XX XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <p className="mt-1.5 text-xs text-muted">نرسل لك رمز تحقّق على واتساب.</p>
          </div>

          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-ink">
              الاسم <span className="font-normal text-muted">(اختياري)</span>
            </label>
            <input
              id="name"
              className="field"
              autoComplete="name"
              placeholder="حتى نناديك باسمك"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy || !phone}>
            {busy ? "…" : "أرسل الرمز"}
          </button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={onConfirm} className="card mt-8 space-y-4 p-5">
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-semibold text-ink">
              الرمز المُرسَل
            </label>
            <input
              id="code"
              className="field nums text-center text-2xl tracking-[0.4em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="······"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
            <p className="mt-1.5 text-xs text-muted">
              أُرسل إلى <span className="nums">{phone}</span> · يبقى صالحاً عشر دقائق.
            </p>
          </div>

          {hint && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{hint}</p>}
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy ? "…" : "تأكيد"}
          </button>

          <div className="flex items-center justify-between text-sm">
            <button type="button" className="text-muted underline" onClick={() => setStep("phone")}>
              تغيير الرقم
            </button>
            <button type="button" className="text-accent underline" onClick={onResend} disabled={busy}>
              إعادة الإرسال
            </button>
          </div>
        </form>
      )}

      {step === "done" && result && (
        <div className="card mt-8 space-y-4 p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">
            ✓
          </div>
          <p className="font-display text-xl font-bold text-ink">
            {result.isNew ? "أهلاً بك في نادي خزف" : "حسابك جاهز"}
          </p>

          <div className="rounded-2xl bg-sand p-4">
            <p className="text-sm text-muted">أختامك الآن</p>
            <p className="nums mt-1 font-display text-4xl font-bold text-ink">
              {result.stamps}
              <span className="text-lg text-muted"> / {stampsPerReward}</span>
            </p>
            {result.rewards > 0 && (
              <p className="mt-3 rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                🎁 عندك <span className="nums">{result.rewards}</span> مشروب مجاني بانتظارك
              </p>
            )}
          </div>

          <p className="text-sm text-muted">
            في كل زيارة قل للباريستا <span className="font-semibold text-ink">«عندي ولاء»</span> وأعطه
            رقم هاتفك — تُحتسب أختامك تلقائياً.
          </p>
        </div>
      )}

      <p className="mt-auto pt-8 text-center text-xs text-muted">
        نستخدم رقمك لحساب أختامك فقط.
      </p>
    </main>
  );
}
