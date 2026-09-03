"use client";

import { useState } from "react";
import type { CartLine, PaymentMethod, ReceiptData } from "@/lib/types";
import { money } from "@/lib/format";

type Props = {
  lines: CartLine[];
  total: number;
  currency: string;
  shopName: string;
  shopPhone: string;
  onCancel: () => void;
  onPaid: (r: ReceiptData) => void;
};

/** مبالغ سريعة شائعة بالدينار — تقلّل الضغطات. */
const QUICK = [1000, 5000, 10000, 25000, 50000];

export default function PaymentDialog({
  lines,
  total,
  currency,
  shopName,
  shopPhone,
  onCancel,
  onPaid,
}: Props) {
  const [method, setMethod] = useState<PaymentMethod | null>(null);
  const [cash, setCash] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const received = Number(cash || 0);
  const change = received - total;

  function press(d: string) {
    setCash((c) => (c === "" && d === "0" ? "" : (c + d).slice(0, 9)));
  }

  async function submit(pm: PaymentMethod) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({
            drink_id: l.drink_id,
            qty: l.qty,
            service: l.service,
            extra_shots: l.extra_shots,
          })),
          payment_method: pm,
          cash_received: pm === "cash" ? received : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "فشل إتمام البيع");

      onPaid({
        number: json.order_number,
        total: json.total,
        change_due: json.change_due ?? null,
        payment_method: pm,
        cash_received: pm === "cash" ? received : null,
        created_at: new Date().toISOString(),
        lines: lines.map((l) => ({
          name: l.name,
          qty: l.qty,
          unit_price: l.unit_price,
          service: l.service,
          extra_shots: l.extra_shots,
        })),
        shop_name: shopName,
        shop_phone: shopPhone,
        currency,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "خطأ غير متوقع");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-4 max-h-[95dvh] overflow-y-auto">
        <div className="flex items-center mb-4">
          <h2 className="font-bold text-lg ml-auto">الدفع</h2>
          <button onClick={onCancel} className="tap px-3 py-1 text-sm">
            رجوع
          </button>
        </div>

        <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-sand">
          <span>المطلوب</span>
          <span className="text-2xl font-bold tabular-nums">{money(total, currency)}</span>
        </div>

        {method === null && (
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setMethod("cash")} className="btn-primary py-6 text-lg">
              كاش
            </button>
            <button onClick={() => submit("card")} disabled={busy} className="btn py-6 text-lg disabled:opacity-50">
              بطاقة
            </button>
          </div>
        )}

        {method === "cash" && (
          <div>
            <div className="flex gap-2 mb-3">
              <button onClick={() => setCash(String(total))} className="btn flex-1 text-sm">
                المبلغ بالضبط
              </button>
              {QUICK.filter((q) => q >= total).slice(0, 3).map((q) => (
                <button key={q} onClick={() => setCash(String(q))} className="btn flex-1 text-sm tabular-nums">
                  {q.toLocaleString("ar-IQ")}
                </button>
              ))}
            </div>

            <div className="card p-3 mb-3 flex items-center justify-between">
              <span className="text-ink/70">المستلم</span>
              <span className="text-2xl font-bold tabular-nums">{received.toLocaleString("ar-IQ")}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-3">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"].map((d) => (
                <button key={d} onClick={() => press(d)} className="btn py-4 text-xl tabular-nums">
                  {d}
                </button>
              ))}
              <button onClick={() => setCash("")} className="btn py-4 text-lg">
                مسح
              </button>
            </div>

            {received > 0 && (
              <div
                className={`p-3 rounded-xl mb-3 flex items-center justify-between ${
                  change >= 0 ? "bg-green-50 text-green-900" : "bg-red-50 text-red-900"
                }`}
              >
                <span>{change >= 0 ? "الباقي" : "ناقص"}</span>
                <span className="text-xl font-bold tabular-nums">{money(Math.abs(change), currency)}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => setMethod(null)} className="btn flex-1">
                رجوع
              </button>
              <button
                onClick={() => submit("cash")}
                disabled={busy || received < total}
                className="btn-primary flex-[2] disabled:opacity-40"
              >
                {busy ? "..." : "تأكيد الدفع"}
              </button>
            </div>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-700 text-center">{error}</p>}
      </div>
    </div>
  );
}
