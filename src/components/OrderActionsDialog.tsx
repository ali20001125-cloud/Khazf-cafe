"use client";

import { useState, useTransition } from "react";
import Modal from "@/components/Modal";
import { money } from "@/lib/format";
import { voidOrder, refundOrder } from "@/app/manage/order-actions";
import type { OrderRow } from "@/lib/orders-admin";

/**
 * إلغاء أو إرجاع طلب مدفوع (§49 · §50).
 * كلاهما يطلب رمز المالك — الرمز هو ما يُثبت الحضور، لا الجلسة المفتوحة.
 */

type Mode = "menu" | "void" | "refund";

export default function OrderActionsDialog({
  order,
  currency,
  onClose,
  onDone,
}: {
  order: OrderRow;
  currency: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>("menu");
  const [reason, setReason] = useState("");
  const [pin, setPin] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"cash" | "card">(order.paid_cash > 0 ? "cash" : "card");
  const [cashReturned, setCashReturned] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [idemKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`
  );

  const paid = order.paid_cash + order.paid_card;
  const refundable = Math.max(paid - order.refunded, 0);

  function doVoid() {
    if (paid > 0 && cashReturned === null) return setError("أجب: هل أُعيد المال للزبون؟");
    setError(null);
    start(async () => {
      const r = await voidOrder(order.id, reason, pin, cashReturned === true);
      if (!r.ok) return setError(r.error);
      onDone();
    });
  }

  function doRefund() {
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) return setError("مبلغ غير صالح");
    if (n > refundable) return setError(`الحدّ الأقصى ${money(refundable, currency)}`);
    setError(null);
    start(async () => {
      const r = await refundOrder({
        orderId: order.id,
        amount: n,
        method,
        reason,
        ownerPin: pin,
        idempotencyKey: idemKey,
      });
      if (!r.ok) return setError(r.error);
      onDone();
    });
  }

  return (
    <Modal title={`فاتورة #${order.order_number}`} onClose={onClose}>
      <div className="mb-4 rounded-xl bg-sand p-3 text-sm">
        <Row label="الإجمالي" value={money(order.total, currency)} />
        <Row label="المدفوع" value={money(paid, currency)} />
        {order.refunded > 0 && (
          <Row label="أُرجع سابقاً" value={money(order.refunded, currency)} tone="red" />
        )}
        <Row label="الحالة" value={statusAr(order.status)} />
      </div>

      {mode === "menu" && (
        <div className="space-y-2">
          <button
            onClick={() => setMode("refund")}
            disabled={refundable <= 0}
            className="btn-ghost w-full py-4 text-right disabled:opacity-40"
          >
            <span className="font-display font-bold text-ink">إرجاع مبلغ</span>
            <span className="mt-0.5 block text-xs text-muted">
              {refundable > 0
                ? `حتى ${money(refundable, currency)} — البيع يبقى في التاريخ`
                : "لا مبلغ قابل للإرجاع"}
            </span>
          </button>

          <button
            onClick={() => setMode("void")}
            disabled={["VOIDED", "REFUNDED", "CANCELLED"].includes(order.status)}
            className="btn-ghost w-full py-4 text-right disabled:opacity-40"
          >
            <span className="font-display font-bold text-ink">إلغاء الطلب</span>
            <span className="mt-0.5 block text-xs text-muted">
              البيع لم يقع — يخرج من مبيعات اليوم ويبقى مسجّلاً
            </span>
          </button>

          <p className="pt-2 text-xs text-muted">
            المواد المستهلكة لا تعود للمخزون في الحالتين (§50).
          </p>
        </div>
      )}

      {mode !== "menu" && (
        <div className="space-y-4">
          {mode === "refund" && (
            <>
              <div>
                <label htmlFor="amt" className="mb-1.5 block text-sm font-semibold text-ink">
                  المبلغ
                </label>
                <input
                  id="amt"
                  className="field nums text-lg"
                  inputMode="numeric"
                  placeholder={String(refundable)}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                />
                <button
                  type="button"
                  onClick={() => setAmount(String(refundable))}
                  className="mt-1.5 text-xs text-accent underline"
                >
                  المبلغ كامل ({money(refundable, currency)})
                </button>
              </div>

              <div>
                <span className="mb-1.5 block text-sm font-semibold text-ink">طريقة الإرجاع</span>
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-dark/5 p-1">
                  <Seg active={method === "cash"} onClick={() => setMethod("cash")}>
                    نقداً
                  </Seg>
                  <Seg active={method === "card"} onClick={() => setMethod("card")}>
                    بطاقة
                  </Seg>
                </div>
                {method === "cash" && (
                  <p className="mt-1.5 text-xs text-muted">يخرج من درج الوردية المفتوحة.</p>
                )}
              </div>
            </>
          )}

          {mode === "void" && paid > 0 && (
            <div>
              <span className="mb-1 block text-sm font-semibold text-ink">
                هل أُعيد المال للزبون؟ <span className="text-red-600">*</span>
              </span>
              <p className="mb-2 text-xs text-muted">
                جوابك يحدّد ما يتوقّعه النظام في الدرج. لا يُستنتج — لأن الخطأ فيه
                إمّا يتّهم أميناً أو يستر نقصاً.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => { setCashReturned(true); setError(null); }}
                  className={`tap rounded-xl border p-3 text-right text-sm ${
                    cashReturned === true ? "border-accent bg-accent/10" : "border-line bg-cream"
                  }`}
                >
                  <span className="font-semibold text-ink">نعم، أعدته</span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    يُنقص المتوقّع في الدرج
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => { setCashReturned(false); setError(null); }}
                  className={`tap rounded-xl border p-3 text-right text-sm ${
                    cashReturned === false ? "border-accent bg-accent/10" : "border-line bg-cream"
                  }`}
                >
                  <span className="font-semibold text-ink">لا، المال في الدرج</span>
                  <span className="mt-0.5 block text-[11px] text-muted">
                    يجب أن يظهر عند العدّ
                  </span>
                </button>
              </div>
            </div>
          )}

          <div>
            <label htmlFor="rsn" className="mb-1.5 block text-sm font-semibold text-ink">
              السبب <span className="text-red-600">*</span>
            </label>
            <input
              id="rsn"
              className="field"
              placeholder={mode === "void" ? "لماذا أُلغي الطلب؟" : "لماذا أُرجع المبلغ؟"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="pin" className="mb-1.5 block text-sm font-semibold text-ink">
              رمز المالك
            </label>
            <input
              id="pin"
              className="field nums text-center text-xl tracking-[0.3em]"
              type="password"
              inputMode="numeric"
              maxLength={8}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}

          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setMode("menu")} className="btn-ghost py-3">
              رجوع
            </button>
            <button
              onClick={mode === "void" ? doVoid : doRefund}
              disabled={pending || !reason.trim() || !pin}
              className="btn-primary py-3 disabled:opacity-40"
            >
              {pending ? "…" : mode === "void" ? "تأكيد الإلغاء" : "تأكيد الإرجاع"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "red" }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-muted">{label}</span>
      <span className={`nums font-medium ${tone === "red" ? "text-red-600" : "text-ink"}`}>{value}</span>
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`tap rounded-lg py-2 text-sm font-medium ${active ? "bg-cream text-ink shadow-soft" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

export function statusAr(s: string): string {
  return (
    {
      DRAFT: "مسودّة",
      PENDING_PAYMENT: "بانتظار الدفع",
      PAID: "مدفوع",
      COMPLETED: "مكتمل",
      VOIDED: "ملغى",
      REFUNDED: "مُرجَع",
      PARTIALLY_REFUNDED: "مُرجَع جزئياً",
      CANCELLED: "ملغى قبل الدفع",
    }[s] ?? s
  );
}
