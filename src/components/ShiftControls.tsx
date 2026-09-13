"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import Modal from "@/components/Modal";
import WasteDialog from "@/components/WasteDialog";
import OrdersDialog from "@/components/OrdersDialog";
import { closeShiftAction } from "@/app/pos/shift-actions";
import { NoSaleDialog, HandoverDialog } from "@/components/DrawerDialogs";

/**
 * شريط الوردية. «سحب نقد» ليس هنا (للمالك من اللوحة)، و«فتح الدرج بلا بيع»
 * يظهر فقط لمن يملك الصلاحية — تُقرَّر في الخادم وتُمرَّر كخاصية، والفعل
 * نفسه يُفحص في الخادم مرّة أخرى (إخفاء الزرّ ليس حماية، §66).
 */
export default function ShiftControls({
  openingFloat,
  currency,
  canNoSale = false,
  canHandover = false,
  countedBy = "owner",
}: {
  openingFloat: number;
  currency: string;
  canNoSale?: boolean;
  canHandover?: boolean;
  /** من يعدّ الدرج — يقرّره المالك من الإعدادات (هجرة 0026). */
  countedBy?: "barista" | "owner" | "none";
}) {
  const [mode, setMode] = useState<null | "close" | "waste" | "orders" | "nosale" | "handover">(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="nums chip bg-accent/20 text-cream/90">وردية · فكّة {money(openingFloat, currency)}</span>
      <button onClick={() => setMode("orders")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">طلباتي</button>
      <button onClick={() => setMode("waste")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">هدر</button>
      {canNoSale && (
        <button onClick={() => setMode("nosale")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">فتح الدرج</button>
      )}
      {canHandover && (
        <button onClick={() => setMode("handover")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">تسليم الدرج</button>
      )}
      <button onClick={() => setMode("close")} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">إغلاق الوردية</button>

      {mode === "orders" && <OrdersDialog currency={currency} onClose={() => setMode(null)} />}
      {mode === "close" && <CloseDialog countedBy={countedBy} onClose={() => setMode(null)} />}
      {mode === "waste" && <WasteDialog onClose={() => setMode(null)} />}
      {mode === "nosale" && <NoSaleDialog onClose={() => setMode(null)} />}
      {mode === "handover" && <HandoverDialog onClose={() => setMode(null)} />}
    </div>
  );
}

function CloseDialog({
  countedBy,
  onClose,
}: {
  countedBy: "barista" | "owner" | "none";
  onClose: () => void;
}) {
  const router = useRouter();
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const mustCount = countedBy === "barista";

  function confirm() {
    if (pending) return;
    let n: number | null = null;
    if (mustCount) {
      n = Number(counted);
      if (!Number.isFinite(n) || n < 0 || counted === "") return setError("أدخل المبلغ المعدود");
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
        <div className="rounded-2xl bg-accent/10 p-4 text-center text-accentdeep">تم تسجيل إغلاق الوردية. شكراً لك.</div>
        <button onClick={() => router.refresh()} className="btn-primary mt-4 w-full py-3">تم</button>
      </Modal>
    );
  }

  return (
    <Modal title="إغلاق الوردية" onClose={onClose}>
      {mustCount ? (
        <>
          <p className="mb-3 text-sm text-muted">
            اعدد النقد في الدرج وأدخل المجموع. لا تظهر لك الأرقام المتوقّعة —
            العدّ أعمى، وهذا يحميك كما يحمي المحلّ.
          </p>
          <input
            type="number" inputMode="numeric" value={counted}
            onChange={(e) => { setCounted(e.target.value); setError(null); }}
            placeholder="المبلغ المعدود في الدرج" className="field nums mb-3 text-center text-lg" dir="ltr"
          />
        </>
      ) : (
        <p className="mb-4 text-sm text-muted">
          {countedBy === "owner"
            ? "اترك النقد في الدرج كما هو — المالك يعدّه. أنهِ ورديتك وخلاص."
            : "أنهِ ورديتك. لا عدّ مطلوب في هذا الفرع."}
        </p>
      )}
      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
      <button onClick={confirm} disabled={pending} className="btn-primary w-full py-3">
        {pending ? "..." : mustCount ? "تأكيد الإغلاق" : "إنهاء الوردية"}
      </button>
    </Modal>
  );
}
