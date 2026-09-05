"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import Modal from "@/components/Modal";
import WasteDialog from "@/components/WasteDialog";
import { closeShiftAction, cashDropAction } from "@/app/pos/shift-actions";

export default function ShiftControls({
  openingFloat,
  currency,
}: {
  openingFloat: number;
  currency: string;
}) {
  const [mode, setMode] = useState<null | "close" | "drop" | "waste">(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs text-emerald-700">
        وردية مفتوحة · فكّة {money(openingFloat, currency)}
      </span>
      <button
        onClick={() => setMode("waste")}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"
      >
        هدر
      </button>
      <button
        onClick={() => setMode("drop")}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"
      >
        سحب نقد
      </button>
      <button
        onClick={() => setMode("close")}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-600"
      >
        إغلاق الوردية
      </button>

      {mode === "close" && <CloseDialog currency={currency} onClose={() => setMode(null)} />}
      {mode === "drop" && <DropDialog currency={currency} onClose={() => setMode(null)} />}
      {mode === "waste" && <WasteDialog onClose={() => setMode(null)} />}
    </div>
  );
}

function CloseDialog({ currency, onClose }: { currency: string; onClose: () => void }) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    if (pending) return;
    const n = Number(counted);
    if (!Number.isFinite(n) || n < 0 || counted === "") {
      setError("أدخل المبلغ المعدود");
      return;
    }
    setError(null);
    start(async () => {
      const res = await closeShiftAction(n);
      if (res.ok) setDone(true);
      else setError(res.error);
    });
  }

  if (done) {
    return (
      <Modal title="أُغلقت الوردية" onClose={() => router.refresh()}>
        <div className="rounded-lg bg-emerald-50 p-4 text-center text-emerald-700">
          تم تسجيل إغلاق الوردية. شكراً لك.
        </div>
        <button
          onClick={() => router.refresh()}
          className="mt-4 w-full rounded-xl bg-[#8a6a4f] py-3 text-sm font-semibold text-white"
        >
          تم
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="إغلاق الوردية" onClose={onClose}>
      <p className="mb-3 text-sm text-neutral-500">
        اعدد النقد في الدرج وأدخل المجموع. (لا تظهر لك الأرقام المتوقّعة — العدّ أعمى.)
      </p>
      <input
        type="number"
        inputMode="numeric"
        value={counted}
        onChange={(e) => {
          setCounted(e.target.value);
          setError(null);
        }}
        placeholder="المبلغ المعدود في الدرج"
        className="mb-3 w-full rounded-lg border border-neutral-200 px-4 py-3 text-center text-lg"
        dir="ltr"
      />
      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
      <button
        onClick={confirm}
        disabled={pending}
        className="w-full rounded-xl bg-[#8a6a4f] py-4 text-base font-semibold text-white disabled:opacity-50"
      >
        {pending ? "..." : "تأكيد الإغلاق"}
      </button>
    </Modal>
  );
}

function DropDialog({ currency, onClose }: { currency: string; onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    if (pending) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      setError("أدخل المبلغ");
      return;
    }
    setError(null);
    start(async () => {
      const res = await cashDropAction(n, reason);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Modal title="سحب نقد من الدرج" onClose={onClose}>
      <p className="mb-3 text-sm text-neutral-500">يُسجَّل السحب ويُنقص الدرج المتوقّع.</p>
      <input
        type="number"
        inputMode="numeric"
        value={amount}
        onChange={(e) => {
          setAmount(e.target.value);
          setError(null);
        }}
        placeholder="المبلغ المسحوب"
        className="mb-2 w-full rounded-lg border border-neutral-200 px-4 py-3 text-center text-lg"
        dir="ltr"
      />
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="السبب (اختياري)"
        className="mb-3 w-full rounded-lg border border-neutral-200 px-4 py-2 text-sm"
      />
      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
      <button
        onClick={confirm}
        disabled={pending}
        className="w-full rounded-xl bg-[#8a6a4f] py-3 text-base font-semibold text-white disabled:opacity-50"
      >
        {pending ? "..." : "تأكيد السحب"}
      </button>
    </Modal>
  );
}
