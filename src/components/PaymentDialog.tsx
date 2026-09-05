"use client";

import { useMemo, useState, useTransition } from "react";
import { money } from "@/lib/format";
import { Modal } from "@/components/PosScreen";
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
  // مفتاح دفع ثابت لهذه المحاولة — يُعيد النتيجة نفسها لو تكرّر الإرسال.
  const [idemKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );

  const tenderedNum = tendered === "" ? null : Number(tendered);
  const change = useMemo(() => {
    if (method !== "cash" || tenderedNum == null) return null;
    return tenderedNum - total;
  }, [method, tenderedNum, total]);

  // مبالغ سريعة: المبلغ المضبوط + تقريبات لأعلى شائعة
  const quick = useMemo(() => {
    const set = new Set<number>([total]);
    for (const step of [1000, 5000, 10000, 25000, 50000]) {
      set.add(Math.ceil(total / step) * step);
    }
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
        items: lines.map((l) => ({
          product_id: l.product_id,
          crop_material_id: l.crop_material_id,
          qty: l.qty,
        })),
        fulfillment,
        method,
        tendered: method === "cash" ? tenderedNum : null,
        idempotencyKey: idemKey,
      });
      if (res.ok) {
        setReceipt({
          orderNumber: res.orderNumber,
          total: res.total,
          change: res.change,
          method,
          fulfillment,
          currency,
          shopName: "مقهى خزف",
          shopPhone: "",
          lines,
          at: new Date().toISOString(),
        });
      } else {
        setError(res.error);
      }
    });
  }

  // شاشة النجاح + الفاتورة
  if (receipt) {
    return (
      <Modal title={`تم الطلب #${receipt.orderNumber}`} onClose={onPaid}>
        <div className="mb-3 rounded-lg bg-emerald-50 p-3 text-center">
          <div className="text-sm text-emerald-700">تم الدفع بنجاح</div>
          {receipt.method === "cash" && receipt.change != null && (
            <div className="mt-1 text-lg font-bold text-emerald-800">
              الباقي: {money(receipt.change, currency)}
            </div>
          )}
        </div>
        <div className="max-h-[40vh] overflow-y-auto rounded-lg border border-neutral-200 p-2">
          <Receipt info={receipt} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            onClick={() => window.print()}
            className="rounded-xl border border-neutral-200 bg-white py-3 text-sm font-medium text-[#5b4636]"
          >
            طباعة
          </button>
          <button onClick={onPaid} className="rounded-xl bg-[#8a6a4f] py-3 text-sm font-semibold text-white">
            طلب جديد
          </button>
        </div>
      </Modal>
    );
  }

  // شاشة الدفع
  return (
    <Modal title="الدفع" onClose={onClose}>
      <div className="mb-4 flex items-center justify-between rounded-lg bg-neutral-50 p-3">
        <span className="text-sm text-neutral-500">المطلوب</span>
        <span className="text-2xl font-bold text-[#5b4636]">{money(total, currency)}</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2">
        <button
          onClick={() => setMethod("cash")}
          className={`rounded-lg py-3 text-sm font-medium ${
            method === "cash" ? "bg-[#8a6a4f] text-white" : "border border-neutral-200 bg-white text-neutral-600"
          }`}
        >
          كاش
        </button>
        <button
          onClick={() => setMethod("card")}
          className={`rounded-lg py-3 text-sm font-medium ${
            method === "card" ? "bg-[#8a6a4f] text-white" : "border border-neutral-200 bg-white text-neutral-600"
          }`}
        >
          بطاقة
        </button>
      </div>

      {method === "cash" ? (
        <>
          <input
            type="number"
            inputMode="numeric"
            value={tendered}
            onChange={(e) => {
              setTendered(e.target.value);
              setError(null);
            }}
            placeholder="المبلغ المدفوع"
            className="mb-2 w-full rounded-lg border border-neutral-200 px-4 py-3 text-center text-lg"
            dir="ltr"
          />
          <div className="mb-3 grid grid-cols-4 gap-2">
            {quick.map((q) => (
              <button
                key={q}
                onClick={() => {
                  setTendered(String(q));
                  setError(null);
                }}
                className="rounded-lg border border-neutral-200 bg-white py-2 text-xs text-[#5b4636]"
              >
                {money(q, "")}
              </button>
            ))}
          </div>
          {change != null && change >= 0 && (
            <div className="mb-3 flex justify-between rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
              <span className="text-sm">الباقي</span>
              <span className="font-bold">{money(change, currency)}</span>
            </div>
          )}
        </>
      ) : (
        <p className="mb-3 rounded-lg bg-neutral-50 p-3 text-center text-sm text-neutral-500">
          مرّر البطاقة على جهاز البنك، ثم أكّد.
        </p>
      )}

      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}

      <button
        onClick={confirm}
        disabled={pending}
        className="w-full rounded-xl bg-[#8a6a4f] py-4 text-lg font-semibold text-white active:scale-[0.99] disabled:opacity-50"
      >
        {pending ? "..." : "تأكيد الدفع"}
      </button>
    </Modal>
  );
}
