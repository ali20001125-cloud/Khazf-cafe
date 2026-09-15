"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { forceCloseShiftAction } from "@/app/manage/shift-count-actions";

/**
 * وردية عالقة.
 *
 * لا تظهر أثناء وردية عادية — تظهر حين تتجاوز الوردية يومها المحاسبي،
 * وهذا وحده يجعلها إشارة: بطاقةٌ تظهر كل مساء تُقرأ زينةً ويتوقّف النظر
 * إليها، فلا تُرى في اليوم الذي كان يجب أن تُرى فيه.
 */
export default function StuckShiftCard({
  shiftId,
  employeeName,
  hours,
}: {
  shiftId: string;
  employeeName: string;
  hours: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const PRESETS = [
    "الباريستا نسي إنهاء الوردية",
    "توقّف جهاز الكاشير",
    "انتهى الدوام ولم يُغلقها",
  ];

  function run() {
    setError(null);
    start(async () => {
      const r = await forceCloseShiftAction(shiftId, reason);
      if (!r.ok) return setError(r.error);
      setOpen(false);
      setReason("");
      router.refresh();
    });
  }

  return (
    <>
      <div className="card border-r-4 border-red-400 p-4">
        <p className="font-display font-bold text-ink">
          وردية {employeeName} مفتوحة منذ <span className="nums">{hours}</span> ساعة
        </p>
        <p className="mt-1 text-sm text-muted">
          ولن تُفتح وردية جديدة قبل إغلاقها — الدرج واحد والمسؤول واحد. أغلقها
          الآن، وستنزل في «بانتظار عدّك» لتعدّ الدرج متى شئت.
        </p>
        <button onClick={() => setOpen(true)} className="btn-primary mt-3 px-5 py-2.5 text-sm">
          أغلق الوردية
        </button>
      </div>

      {open && (
        <Modal title="إغلاق وردية عالقة" onClose={() => setOpen(false)}>
          <p className="rounded-xl bg-sand p-3 text-sm text-muted">
            المبلغ المتوقّع يُحفظ الآن كما هو، والمعدود يبقى فارغاً حتى تعدّه.
            «فارغ» يعني <span className="font-semibold text-ink">لم يُعدّ</span>، لا «طابق».
          </p>

          <label className="mb-1.5 mt-4 block text-sm font-semibold text-ink">السبب</label>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => { setReason(p); setError(null); }}
                className={`tap rounded-xl border px-3 py-2 text-xs ${
                  reason === p ? "border-accent bg-accent/10 text-ink" : "border-line bg-cream text-muted"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <input
            className="field"
            value={reason}
            onChange={(e) => { setReason(e.target.value); setError(null); }}
            placeholder="أو اكتب سبباً آخر"
          />
          <p className="mt-1.5 text-xs text-muted">يُسجَّل باسمك في سجلّ التدقيق.</p>

          {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setOpen(false)} className="btn-ghost flex-1 py-3">
              رجوع
            </button>
            <button
              onClick={run}
              disabled={pending || !reason.trim()}
              className="btn-primary flex-1 py-3 disabled:opacity-30"
            >
              {pending ? "…" : "أغلقها"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
