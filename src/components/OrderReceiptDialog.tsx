"use client";

import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { money, num, timeAr, baseQtyLabel } from "@/lib/format";
import { orderDetailAction } from "@/app/manage/order-actions";
import type { OrderDetail } from "@/lib/orders-admin";

const TYPE_AR: Record<string, string> = {
  SALE: "بيع",
  LOYALTY_REWARD: "مكافأة",
  STAFF_DRINK: "مشروب موظّف",
  COMPLIMENTARY: "ضيافة",
};

/**
 * الفاتورة كما صدرت — مع **ما خصمته من المخزون**.
 *
 * شاشة الطلبات كانت تقول «كم»، ولا تقول «ماذا». والفرق بينهما هو الفرق
 * بين أن تعرف سبب النقص وأن تخمّنه: مشروب الموظّف بصفر دينار لا يظهر في
 * المبيعات، لكنه بنٌّ خرج فعلاً. فمن لا يفتح فاتورته يرى مخزوناً نقص بلا
 * بيع — ويشكّ في باريستا أمين.
 */
export default function OrderReceiptDialog({
  orderId,
  currency,
  onClose,
}: {
  orderId: string;
  currency: string;
  onClose: () => void;
}) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    orderDetailAction(orderId).then((r) => {
      if (!alive) return;
      if (r.ok) setOrder(r.order);
      else setError(r.error);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (error) {
    return (
      <Modal title="الفاتورة" onClose={onClose}>
        <p className="py-6 text-center text-sm text-red-600">{error}</p>
      </Modal>
    );
  }

  if (!order) {
    return (
      <Modal title="الفاتورة" onClose={onClose}>
        <p className="py-8 text-center text-sm text-muted">…</p>
      </Modal>
    );
  }

  const paid = order.paid_cash + order.paid_card;
  const voided = ["VOIDED", "CANCELLED"].includes(order.status);

  // بلا فاصلة آلاف: رقم الفاتورة مُعرّف يُقرأ حرفاً حرفاً، لا مبلغ
  return (
    <Modal title={`فاتورة ${order.order_number}`} onClose={onClose}>
      <div className="space-y-4">
        {/* الترويسة */}
        <div className="rounded-2xl bg-sand p-3 text-xs text-muted">
          <div className="flex flex-wrap justify-between gap-2">
            <span className="nums">{timeAr(order.created_at)}</span>
            <span>{order.employee_name}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <span className="chip bg-dark/5 text-muted">
              {order.fulfillment === "takeaway" ? "سفري" : "جلوس"}
            </span>
            {order.order_type !== "SALE" && (
              <span className="chip bg-accent/12 text-accentdeep">
                {TYPE_AR[order.order_type] ?? order.order_type}
              </span>
            )}
            {voided && <span className="chip bg-red-50 text-red-700">ملغاة</span>}
          </div>
        </div>

        {/* الأصناف */}
        <ul className="divide-y divide-line">
          {order.items.map((i, k) => (
            <li key={k} className="flex items-start justify-between gap-3 py-2">
              <span className="text-sm text-ink">
                {i.name}
                {i.crop && <span className="block text-[11px] text-muted">{i.crop}</span>}
              </span>
              <span className="nums shrink-0 text-sm text-muted">
                {num(i.qty)} ×{" "}
                {i.is_free ? (
                  <span className="text-accentdeep">مجّاني</span>
                ) : (
                  money(i.unit_price, currency)
                )}
              </span>
            </li>
          ))}
        </ul>

        {/* المبالغ */}
        <div className="space-y-1 border-t border-line pt-3 text-sm">
          {order.discount > 0 && (
            <Line label="قبل الحسم" value={money(order.subtotal, currency)} />
          )}
          <Line label="المجموع" value={money(order.total, currency)} strong />
          {order.paid_cash > 0 && <Line label="نقداً" value={money(order.paid_cash, currency)} />}
          {order.paid_card > 0 && <Line label="بطاقة" value={money(order.paid_card, currency)} />}
          {paid === 0 && !voided && (
            <p className="pt-1 text-xs text-muted">
              بلا دفع — فلا تدخل حساب الدرج، لكنها تخصم من المخزون.
            </p>
          )}
          {order.refunded > 0 && (
            <Line label="أُرجع" value={`− ${money(order.refunded, currency)}`} tone="bad" />
          )}
        </div>

        {/* ما نقص من المخزون */}
        {order.consumed.length > 0 && (
          <div className="rounded-2xl border border-line bg-cream p-3">
            <h3 className="mb-1.5 text-xs font-semibold text-ink">ما نقص من المخزون</h3>
            <ul className="space-y-1">
              {order.consumed.map((c, k) => (
                <li key={k} className="flex justify-between text-xs">
                  <span className="text-muted">{c.material}</span>
                  <span className="nums font-medium text-ink">
                    {baseQtyLabel(c.qty, c.unit)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* الإلغاء والإرجاع */}
        {order.voided && (
          <div className="rounded-2xl bg-red-50 p-3 text-xs text-red-900">
            أُلغيت بيد {order.voided.voided_by} — {order.voided.reason}
            <span className="nums block text-red-700">{timeAr(order.voided.created_at)}</span>
          </div>
        )}
        {order.refunds.map((r, k) => (
          <div key={k} className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-900">
            إرجاع {money(r.amount, currency)} بيد {r.requested_by} — {r.reason}
            <span className="nums block text-amber-700">{timeAr(r.created_at)}</span>
          </div>
        ))}

        <button onClick={onClose} className="btn-primary w-full py-3">
          تم
        </button>
      </div>
    </Modal>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "bad";
}) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span
        className={`nums ${strong ? "font-bold text-ink" : tone === "bad" ? "text-red-600" : "text-ink"}`}
      >
        {value}
      </span>
    </div>
  );
}
