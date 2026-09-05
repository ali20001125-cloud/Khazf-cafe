"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import Modal from "@/components/Modal";
import WasteDialog from "@/components/WasteDialog";
import OrdersDialog from "@/components/OrdersDialog";
import { closeShiftAction, cashDropAction } from "@/app/pos/shift-actions";

export default function ShiftControls({ openingFloat, currency }: { openingFloat: number; currency: string }) {
  const [mode, setMode] = useState<null | "close" | "drop" | "waste" | "orders">(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="nums chip bg-accent/20 text-cream/90">وردية · فكّة {money(openingFloat, currency)}</span>
      <button onClick={() => setMode("orders")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">طلباتي</button>
      <button onClick={() => setMode("waste")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">هدر</button>
      <button onClick={() => setMode("drop")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">سحب نقد</button>
      <button onClick={() => setMode("close")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">إغلاق الوردية</button>

      {mode === "orders" && <OrdersDialog currency={currency} onClose={() => setMode(null)} />}
      {mode === "close" && <CloseDialog onClose={() => setMode(null)} />}
      {mode === "drop" && <DropDialog onClose={() => setMode(null)} />}
      {mode === "waste" && <WasteDialog onClose={() => setMode(null)} />}
    </div>
  );
}

function CloseDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  function confirm() {
    if (pending) return;
    const n = Number(counted);
    if (!Number.isFinite(n) || n < 0 || counted === "") return setError("أدخل المبلغ المعدود");
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
        <div className="rounded-2xl bg-accent/10 p-4 text-center text-accentdeep">تم تسجيل إغلاق الوردية. شكراً لك.</div>
        <button onClick={() => router.refresh()} className="btn-primary mt-4 w-full py-3">تم</button>
      </Modal>
    );
  }

  return (
    <Modal title="إغلاق الوردية" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">اعدد النقد في الدرج وأدخل المجموع. (لا تظهر لك الأرقام المتوقّعة — العدّ أعمى.)</p>
      <input
        type="number" inputMode="numeric" value={counted}
        onChange={(e) => { setCounted(e.target.value); setError(null); }}
        placeholder="المبلغ المعدود في الدرج" className="field nums mb-3 text-center text-lg" dir="ltr"
      />
      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
      <button onClick={confirm} disabled={pending} className="btn-primary w-full">{pending ? "..." : "تأكيد الإغلاق"}</button>
    </Modal>
  );
}

function DropDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    if (pending) return;
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return setError("أدخل المبلغ");
    setError(null);
    start(async () => {
      const res = await cashDropAction(n, reason);
      if (res.ok) { onClose(); router.refresh(); }
      else setError(res.error);
    });
  }

  return (
    <Modal title="سحب نقد من الدرج" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">يُسجَّل السحب ويُنقص الدرج المتوقّع.</p>
      <input type="number" inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value); setError(null); }} placeholder="المبلغ المسحوب" className="field nums mb-2 text-center text-lg" dir="ltr" />
      <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="السبب (اختياري)" className="field mb-3" />
      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
      <button onClick={confirm} disabled={pending} className="btn-primary w-full">{pending ? "..." : "تأكيد السحب"}</button>
    </Modal>
  );
}
