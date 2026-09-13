"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { money } from "@/lib/format";
import { countClosedShiftAction } from "@/app/manage/shift-count-actions";

/**
 * عدّ المالك لدرج وردية أُغلقت بانتظاره.
 *
 * المتوقّع **لا يُعرض قبل الإدخال** — ولو كان الذي يعدّ هو المالك. الرقم
 * الذي تراه قبل أن تعدّ يقود يدك إليه بلا أن تشعر. يُعرض بعدها كاملاً.
 */
export default function CountDrawerDialog({
  shiftId,
  employeeName,
  currency,
  onClose,
}: {
  shiftId: string;
  employeeName: string;
  currency: string;
  onClose: () => void;
}) {
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ counted: number; expected: number; variance: number } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (result) {
    const ok = result.variance === 0;
    return (
      <Modal title="سُجّل العدّ" onClose={() => { onClose(); router.refresh(); }}>
        <div className={`rounded-2xl p-4 text-center ${ok ? "bg-emerald-50" : "bg-red-50"}`}>
          <p className={`font-display text-xl font-bold ${ok ? "text-emerald-800" : "text-red-700"}`}>
            {ok
              ? "مضبوط"
              : `${result.variance < 0 ? "نقص" : "زيادة"} ${money(Math.abs(result.variance), currency)}`}
          </p>
        </div>
        <dl className="mt-3 space-y-1 text-sm">
          <Row label="المتوقّع" value={money(result.expected, currency)} />
          <Row label="المعدود" value={money(result.counted, currency)} />
        </dl>
        <button onClick={() => { onClose(); router.refresh(); }} className="btn-primary mt-4 w-full py-3">
          تم
        </button>
      </Modal>
    );
  }

  return (
    <Modal title={`عدّ درج وردية ${employeeName}`} onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        اعدد النقد في الدرج وأدخل المجموع. لا يُعرض المتوقّع قبل الإدخال — الرقم
        الذي تراه قبل أن تعدّ يقود يدك إليه.
      </p>
      <input
        type="number"
        inputMode="numeric"
        dir="ltr"
        className="field nums mb-3 text-center text-lg"
        placeholder="المبلغ المعدود"
        value={counted}
        onChange={(e) => { setCounted(e.target.value); setError(null); }}
      />
      {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
      <button
        onClick={() => {
          const n = Number(counted);
          if (counted === "" || !Number.isFinite(n) || n < 0) return setError("أدخل المبلغ المعدود");
          setError(null);
          start(async () => {
            const r = await countClosedShiftAction(shiftId, n);
            if (!r.ok) return setError(r.error);
            setResult({ counted: r.counted, expected: r.expected, variance: r.variance });
          });
        }}
        disabled={pending}
        className="btn-primary w-full py-3 disabled:opacity-40"
      >
        {pending ? "…" : "تسجيل العدّ"}
      </button>
    </Modal>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="nums font-medium text-ink">{value}</dd>
    </div>
  );
}
