"use client";

import { useEffect } from "react";
import type { ReceiptData } from "@/lib/types";
import { money, timeAr } from "@/lib/format";

export default function Receipt({ data, onClose }: { data: ReceiptData; onClose: () => void }) {
  // طباعة تلقائية على الحرارية ٨٠مم عبر المتصفح.
  useEffect(() => {
    const t = setTimeout(() => window.print(), 250);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl p-4 max-h-[95dvh] overflow-y-auto">
        <div id="receipt" className="font-mono text-sm leading-6">
          <div className="text-center">
            <div className="font-bold text-base">{data.shop_name}</div>
            {data.shop_phone && <div>{data.shop_phone}</div>}
            <div>فاتورة رقم {data.number}</div>
            <div>{timeAr(data.created_at)}</div>
          </div>

          <div className="border-y border-dashed border-black/40 my-2 py-2 space-y-1">
            {data.lines.map((l, i) => (
              <div key={i} className="flex justify-between gap-2">
                <span className="flex-1">
                  {l.name}
                  {l.extra_shots > 0 ? ` +${l.extra_shots}ش` : ""}
                  {l.service === "dinein" ? " (جلوس)" : ""}
                  {l.qty > 1 ? ` ×${l.qty}` : ""}
                </span>
                <span className="tabular-nums">{(l.unit_price * l.qty).toLocaleString("ar-IQ")}</span>
              </div>
            ))}
          </div>

          <div className="flex justify-between font-bold text-base">
            <span>المجموع</span>
            <span className="tabular-nums">{money(data.total, data.currency)}</span>
          </div>

          <div className="flex justify-between">
            <span>الدفع</span>
            <span>{data.payment_method === "cash" ? "كاش" : "بطاقة"}</span>
          </div>

          {data.payment_method === "cash" && data.cash_received !== null && (
            <>
              <div className="flex justify-between">
                <span>المستلم</span>
                <span className="tabular-nums">{money(data.cash_received, data.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>الباقي</span>
                <span className="tabular-nums">{money(data.change_due ?? 0, data.currency)}</span>
              </div>
            </>
          )}

          <div className="text-center mt-3 border-t border-dashed border-black/40 pt-2">شكراً لزيارتك</div>
        </div>

        <div className="flex gap-2 mt-4 print:hidden">
          <button onClick={() => window.print()} className="btn flex-1">
            طباعة
          </button>
          <button onClick={onClose} className="btn-primary flex-1">
            طلب جديد
          </button>
        </div>
      </div>
    </div>
  );
}
