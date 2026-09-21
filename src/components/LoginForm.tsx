"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/login/actions";

/**
 * الدخول: الاسم ثمّ الرمز.
 *
 * **حقلٌ يُكتب فيه الاسم، لا قائمةٌ تُعرض.** والفرق ليس شكليّاً: قائمةُ
 * أسماء تُعلن لكل من أمسك الجهاز أنّ ثمّة حساب مالك وما اسمه — فيعرف
 * أيّ بابٍ يطرق. ومن يكتب اسمه يعرفه أصلاً.
 *
 * والرمز يقبل الحروف والأرقام: رمز المالك طويلٌ بحروف، ورمز الباريستا
 * ستّة أرقام. ولذلك حقلُ نصٍّ لا لوحة أرقام — ولوحةُ أرقامٍ لا تكتب
 * حرفاً.
 */
export default function LoginForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ready = name.trim().length > 0 && code.trim().length >= 4;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (pending || !ready) return;
    start(async () => {
      const res = await loginAction(name, code);
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      if (res.reason === "locked") setError(`محاولات كثيرة — انتظر ${res.minutes} دقيقة`);
      else if (res.reason === "bad_pin")
        setError(`الاسم أو الرمز غير صحيح — تبقّى ${res.remaining} محاولة`);
      else setError("الاسم أو الرمز غير صحيح");
      setCode("");
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-ink">
          الاسم
        </label>
        <input
          id="name"
          className="field text-lg"
          autoComplete="username"
          autoCapitalize="off"
          autoCorrect="off"
          placeholder="اسمك كما سجّله المالك"
          value={name}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          disabled={pending}
        />
      </div>

      <div>
        <label htmlFor="code" className="mb-1.5 block text-sm font-semibold text-ink">
          الرمز
        </label>
        <div className="relative">
          <input
            id="code"
            className="field pl-12 text-lg"
            type={show ? "text" : "password"}
            autoComplete="current-password"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            dir="ltr"
            value={code}
            onChange={(e) => { setCode(e.target.value); setError(null); }}
            disabled={pending}
          />
          {/* من يكتب رمزاً طويلاً بحروفٍ يحتاج أن يرى ما كتب */}
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? "إخفاء الرمز" : "إظهار الرمز"}
            className="absolute inset-y-0 left-0 flex w-12 items-center justify-center text-muted"
          >
            {show ? <EyeOff /> : <Eye />}
          </button>
        </div>
      </div>

      <div
        className={`min-h-[1.25rem] text-center text-sm ${error ? "text-red-600" : "text-transparent"}`}
        role="status"
        aria-live="polite"
      >
        {error ?? "."}
      </div>

      <button type="submit" disabled={pending || !ready} className="btn-primary w-full py-4 text-lg disabled:opacity-40">
        {pending ? "…" : "دخول"}
      </button>
    </form>
  );
}

function Eye() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.2 6.3A17 17 0 0 0 2 12s3.6 7 10 7a9.8 9.8 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}
