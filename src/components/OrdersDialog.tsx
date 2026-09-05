"use client";

import { useEffect, useState } from "react";
import { timeAr } from "@/lib/format";
import Modal from "@/components/Modal";
import Receipt, { type ReceiptInfo } from "@/components/Receipt";
import type { CartLine } from "@/components/PosScreen";
import { listShiftOrders, type ShiftOrder } from "@/app/pos/orders-actions";

export default function OrdersDialog({ currency, onClose }: { currency: string; onClose: () => void }) {
  const [orders, setOrders] = useState<ShiftOrder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sel, setSel] = useState<ShiftOrder | null>(null);

  useEffect(() => {
    listShiftOrders().then((res) => {
      if (Array.isArray(res)) setOrders(res);
      else setError(res.error);
    });
  }, []);

  // إعادة طباعة فاتورة واحدة
  if (sel) {
    const info: ReceiptInfo = {
      orderNumber: sel.orderNumber,
      total: sel.total,
      change: sel.change,
      method: sel.method ?? "cash",
      fulfillment: sel.fulfillment,
      currency,
      shopName: "مقهى خزف",
      shopPhone: "",
      lines: sel.lines.map((l, i) => ({
        key: String(i), product_id: "", name: l.name, crop_material_id: "", crop_name: "",
        unit_price: l.unit_price, qty: l.qty,
      })) as CartLine[],
      at: sel.at,
    };
    return (
      <Modal title={`فاتورة #${sel.orderNumber}`} onClose={() => setSel(null)}>
        <div className="max-h-[45vh] overflow-y-auto rounded-2xl border border-line bg-cream p-2">
          <Receipt info={info} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => setSel(null)} className="btn-ghost">رجوع</button>
          <button onClick={() => window.print()} className="btn-primary py-3">طباعة</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="طلبات الوردية" onClose={onClose}>
      {error ? (
        <p className="py-6 text-center text-sm text-red-600">{error}</p>
      ) : orders === null ? (
        <p className="py-6 text-center text-sm text-muted">...</p>
      ) : orders.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">لا طلبات في هذه الوردية بعد.</p>
      ) : (
        <div className="max-h-[55vh] space-y-2 overflow-y-auto">
          {orders.map((o) => (
            <button
              key={o.orderNumber}
              onClick={() => setSel(o)}
              className="tap w-full rounded-xl border border-line bg-cream p-3 text-right hover:border-accent/40"
            >
              <div className="flex items-center justify-between">
                <span className="nums font-display font-bold text-ink">#{o.orderNumber}</span>
                <span className="chip bg-dark/5 text-muted">{o.fulfillment === "takeaway" ? "سفري" : "جلوس"}</span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {o.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(" · ")}
                </span>
                <span className="nums text-[11px] text-muted">{timeAr(o.at)}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
