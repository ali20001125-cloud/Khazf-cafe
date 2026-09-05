"use client";

import { useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import Modal from "@/components/Modal";
import type { CartLine } from "@/components/PosScreen";
import Receipt, { type ReceiptInfo } from "@/components/Receipt";
import { pay } from "@/app/pos/actions";

type Method = "cash" | "card";

export default function PaymentDialog({
  lines,
  total,
  fulfillment,
  currency,
  onClose,
  onPaid,
}: {
  lines: CartLine[];
  total: number;
  fulfillment: "takeaway" | "dine_in";
  currency: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<Method>("cash");
  const [tendered, setTendered] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [pending, start] = useTransition();
  const [idemKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );

  const tenderedNum = tendered === "" ? null : Number(tendered);
  const change = useMemo(() => {
    if (method !== "cash" || tenderedNum == null) return null;
    return tenderedNum - total;
  }, [method, tenderedNum, total]);

  const quick = useMemo(() => {
    const set = new Set<number>([total]);
    for (const step of [1000, 5000, 10000, 25000, 50000]) set.add(Math.ceil(total / step) * step);
    return [...set].filter((n) => n >= total).sort((a, b) => a - b).slice(0, 4);
  }, [total]);

  function confirm() {
    if (pending) return;
    if (method === "cash" && (tenderedNum == null || tenderedNum < total)) {
      setError("المبلغ المدفوع أقل من الإجمالي");
      return;
    }
    setError(null);
    start(async () => {
      const res = await pay({
        items: lines.map((l) => ({ product_id: l.product_id, crop_material_id: l.crop_material_id, qty: l.qty })),
        fulfillment,
        method,
        tendered: method === "cash" ? tenderedNum : null,
        idempotencyKey: idemKey,
      });
      if (res.ok) {
        setReceipt({
          orderNumber: res.orderNumber, total: res.total, change: res.change, method, fulfillment,
          currency, shopName: "مقهى خزف", shopPhone: "", lines, at: new Date().toISOString(),
        });
      } else {
        setError(res.error);
      }
    });
  }

  if (receipt) {
    return (
      <Modal title={`تم الطلب #${receipt.orderNumber}`} onClose={onPaid}>
        <div className="mb-4 rounded-2xl bg-accent/10 p-4 text-center">
          <div className="text-sm text-accentdeep">تم الدفع بنجاح</div>
          {receipt.method === "cash" && receipt.change != null && (
            <div className="nums mt-1 font-display text-2xl font-bold text-accentdeep">
              الباقي {money(receipt.change, currency)}
            </div>
          )}
        </div>
        <div className="max-h-[40vh] overflow-y-auto rounded-2xl border border-line bg-cream p-2">
          <Receipt info={receipt} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => window.print()} className="btn-ghost">طباعة</button>
          <button onClick={onPaid} className="btn-primary py-3">طلب جديد</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="الدفع" onClose={onClose}>
      <div className="mb-5 flex items-baseline justify-between rounded-2xl bg-dark/5 px-4 py-4">
        <span className="text-sm text-muted">المطلوب</span>
        <span className="nums font-display text-3xl font-bold text-ink">{money(total, currency)}</span>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-dark/5 p-1">
        <MSeg active={method === "cash"} onClick={() => setMethod("cash")}>كاش</MSeg>
        <MSeg active={method === "card"} onClick={() => setMethod("card")}>بطاقة</MSeg>
      </div>

      {method === "cash" ? (
        <>
          <input
            type="number" inputMode="numeric" value={tendered}
            onChange={(e) => { setTendered(e.target.value); setError(null); }}
            placeholder="المبلغ المدفوع"
            className="field nums mb-2 text-center text-lg" dir="ltr"
          />
          <div className="mb-4 grid grid-cols-4 gap-2 nums">
            {quick.map((q) => (
              <button key={q} onClick={() => { setTendered(String(q)); setError(null); }} className="tap rounded-xl border border-line bg-cream py-2 text-xs text-ink">
                {money(q, "")}
              </button>
            ))}
          </div>
          {change != null && change >= 0 && (
            <div className="mb-4 flex items-center justify-between rounded-2xl bg-accent/10 px-4 py-3 text-accentdeep">
              <span className="text-sm">الباقي</span>
              <span className="nums font-display font-bold">{money(change, currency)}</span>
            </div>
          )}
        </>
      ) : (
        <p className="mb-4 rounded-2xl bg-dark/5 p-4 text-center text-sm text-muted">مرّر البطاقة على جهاز البنك، ثم أكّد.</p>
      )}

      {error && <div className="mb-4 text-center text-sm text-red-600">{error}</div>}

      <button onClick={confirm} disabled={pending} className="btn-primary w-full text-lg">
        {pending ? "..." : "تأكيد الدفع"}
      </button>
    </Modal>
  );
}

function MSeg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`tap rounded-lg py-2.5 text-sm font-medium ${active ? "bg-cream text-ink shadow-soft" : "text-muted"}`}>
      {children}
    </button>
  );
}
