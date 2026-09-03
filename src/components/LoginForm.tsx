"use client";

import { useFormState } from "react-dom";
import { login } from "@/app/admin/actions";

export default function LoginForm() {
  const [error, formAction] = useFormState(login, null);

  return (
    <form action={formAction} className="card p-6 w-full max-w-xs text-center">
      <h1 className="font-bold text-lg mb-1">لوحة المالك</h1>
      <p className="text-sm text-ink/60 mb-4">أدخل الرمز</p>
      <input
        name="pin"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        className="input text-center text-2xl tracking-widest mb-3"
        placeholder="••••"
      />
      <button className="btn-primary w-full">دخول</button>
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
    </form>
  );
}
