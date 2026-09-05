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
    if (next.length === 4) submit(next); // دخول سريع بأربعة أرقام
  }

  // شاشة اختيار المستخدم
  if (!sel) {
    return (
      <div className="space-y-3">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={() => pick(u)}
            className="flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-5 py-4 text-right shadow-sm active:scale-[0.99]"
          >
            <span className="text-lg font-semibold text-[#5b4636]">{u.name}</span>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-500">
              {u.role === "owner" ? "المالك" : "باريستا"}
            </span>
          </button>
        ))}
        {users.length === 0 && (
          <p className="text-center text-sm text-neutral-400">لا يوجد مستخدمون نشطون</p>
        )}
      </div>
    );
  }

  // شاشة إدخال الرمز
  const pad = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];
  return (
    <div>
      <button
        onClick={() => setSel(null)}
        className="mb-4 text-sm text-neutral-500"
        disabled={pending}
      >
        ← تغيير المستخدم
      </button>

      <div className="mb-2 text-center text-lg font-semibold text-[#5b4636]">{sel.name}</div>

      <div className="mb-4 flex justify-center gap-2" dir="ltr">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-3 w-3 rounded-full ${
              i < pin.length ? "bg-[#8a6a4f]" : "bg-neutral-200"
            } ${i >= 4 && pin.length <= 4 ? "opacity-40" : ""}`}
          />
        ))}
      </div>

      <div
        className={`mb-4 h-6 text-center text-sm ${error ? "text-red-600" : "text-transparent"}`}
      >
        {error ?? "."}
      </div>

      <div className="grid grid-cols-3 gap-3" dir="ltr">
        {pad.map((d) => (
          <button
            key={d}
            onClick={() => press(d)}
            disabled={pending}
            className="rounded-xl border border-neutral-200 bg-white py-5 text-2xl font-semibold text-[#5b4636] shadow-sm active:scale-95 disabled:opacity-50"
          >
            {d}
          </button>
        ))}
        <button
          onClick={() => setPin("")}
          disabled={pending}
          className="rounded-xl bg-neutral-100 py-5 text-sm text-neutral-500 active:scale-95 disabled:opacity-50"
        >
          مسح
        </button>
        <button
          onClick={() => press("0")}
          disabled={pending}
          className="rounded-xl border border-neutral-200 bg-white py-5 text-2xl font-semibold text-[#5b4636] shadow-sm active:scale-95 disabled:opacity-50"
        >
          0
        </button>
        <button
          onClick={() => pin.length >= 4 && submit(pin)}
          disabled={pending || pin.length < 4}
          className="rounded-xl bg-[#8a6a4f] py-5 text-lg font-semibold text-white active:scale-95 disabled:opacity-40"
        >
          {pending ? "..." : "دخول"}
        </button>
      </div>
    </div>
  );
}
