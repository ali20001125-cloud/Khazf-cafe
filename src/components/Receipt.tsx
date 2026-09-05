"use client";

import { money, timeAr } from "@/lib/format";
import type { CartLine } from "@/components/PosScreen";

export type ReceiptInfo = {
  orderNumber: number;
  total: number;
  change: number | null;
  method: "cash" | "card";
  fulfillment: "takeaway" | "dine_in";
  currency: string;
  shopName: string;
  shopPhone: string;
  lines: CartLine[];
  at: string; // ISO
};

/** فاتورة حرارية ٨٠مم — تُطبع من المتصفح. */
export default function Receipt({ info }: { info: ReceiptInfo }) {
  return (
    <div id="receipt" className="mx-auto w-[280px] bg-white p-3 text-black" dir="rtl">
      <div className="text-center">
        <div className="text-lg font-bold">{info.shopName}</div>
        {info.shopPhone && <div className="text-xs">{info.shopPhone}</div>}
      </div>
      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between text-xs">
        <span>طلب #{info.orderNumber}</span>
        <span>{info.fulfillment === "takeaway" ? "سفري" : "جلوس"}</span>
      </div>
      <div className="text-xs">{timeAr(info.at)}</div>
      <div className="my-2 border-t border-dashed border-black" />

      <table className="w-full text-sm">
        <tbody>
          {info.lines.map((l) => (
            <tr key={l.key}>
              <td className="py-0.5 align-top">
                {l.name}
                <span className="text-[10px] text-neutral-600"> ×{l.qty}</span>
              </td>
              <td className="py-0.5 text-left align-top whitespace-nowrap">
                {money(l.unit_price * l.qty, info.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-2 border-t border-dashed border-black" />
      <div className="flex justify-between text-base font-bold">
        <span>الإجمالي</span>
        <span>{money(info.total, info.currency)}</span>
      </div>
      <div className="mt-1 flex justify-between text-xs">
        <span>الدفع</span>
        <span>{info.method === "cash" ? "كاش" : "بطاقة"}</span>
      </div>
      {info.method === "cash" && info.change != null && (
        <div className="flex justify-between text-xs">
          <span>الباقي</span>
          <span>{money(info.change, info.currency)}</span>
        </div>
      )}
      <div className="my-2 border-t border-dashed border-black" />
      <div className="text-center text-xs">شكراً لزيارتكم</div>
    </div>
  );
}
