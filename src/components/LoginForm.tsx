"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { loginAction } from "@/app/login/actions";

type LoginUser = { id: string; name: string; role: "owner" | "barista" };

export default function LoginForm({ users }: { users: LoginUser[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<LoginUser | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function pick(u: LoginUser) {
    setSel(u);
    setPin("");
    setError(null);
  }

  function submit(finalPin: string) {
    if (!sel || pending) return;
    start(async () => {
      const res = await loginAction(sel.id, finalPin);
      if (res.ok) {
        router.replace("/");
        router.refresh();
        return;
      }
      if (res.reason === "locked") setError(`الحساب مقفل مؤقتاً — حاول بعد ${res.minutes} دقيقة`);
      else if (res.reason === "bad_pin") setError(`رمز غير صحيح — تبقّى ${res.remaining} محاولة`);
      else setError("تعذّر الدخول");
      setPin("");
    });
  }

  function press(d: string) {
    if (pending) return;
    setError(null);
    const next = (pin + d).slice(0, 6);
    setPin(next);
    if (next.length === 4) submit(next);
  }

  // اختيار المستخدم
  if (!sel) {
    return (
      <div className="space-y-3">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => pick(u)}
            className="tap flex w-full items-center justify-between rounded-xl2 border border-line bg-sand/60 px-5 py-4 text-right hover:border-accent/40"
          >
            <span className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/12 font-display text-lg font-bold text-accent">
                {u.name.slice(0, 1)}
              </span>
              <span className="font-display text-lg font-bold text-ink">{u.name}</span>
            </span>
            <span className="chip bg-dark/5 text-muted">{u.role === "owner" ? "المالك" : "باريستا"}</span>
          </button>
        ))}
        {users.length === 0 && <p className="text-center text-sm text-muted">لا يوجد مستخدمون نشطون</p>}
      </div>
    );
  }

  // إدخال الرمز
  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div>
      <button onClick={() => setSel(null)} className="mb-4 text-sm text-muted" disabled={pending}>
        ← تغيير المستخدم
      </button>

      <div className="mb-1 text-center font-display text-xl font-bold text-ink">{sel.name}</div>

      <div className="mb-5 mt-4 flex justify-center gap-2.5" dir="ltr">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full transition-colors ${
              i < pin.length ? "bg-accent" : "bg-line"
            } ${i >= 4 && pin.length <= 4 ? "opacity-30" : ""}`}
          />
        ))}
      </div>

      <div className={`mb-4 h-5 text-center text-sm ${error ? "text-red-600" : "text-transparent"}`}>
        {error ?? "."}
      </div>

      <div className="grid grid-cols-3 gap-2.5 nums" dir="ltr">
        {pad.map((d) => (
          <button key={d} onClick={() => press(d)} disabled={pending} className="tap rounded-xl2 border border-line bg-sand/60 py-5 font-display text-2xl font-bold text-ink hover:border-accent/40 disabled:opacity-50">
            {d}
          </button>
        ))}
        <button onClick={() => setPin("")} disabled={pending} className="tap rounded-xl2 bg-transparent py-5 text-sm text-muted disabled:opacity-50">
          مسح
        </button>
        <button onClick={() => press("0")} disabled={pending} className="tap rounded-xl2 border border-line bg-sand/60 py-5 font-display text-2xl font-bold text-ink hover:border-accent/40 disabled:opacity-50">
          0
        </button>
        <button onClick={() => pin.length >= 4 && submit(pin)} disabled={pending || pin.length < 4} className="btn-primary py-5 text-lg">
          {pending ? "..." : "دخول"}
        </button>
      </div>
    </div>
  );
}
