"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { money, timeAr } from "@/lib/format";
import type { OrderRow } from "@/lib/orders-admin";
import OrderActionsDialog, { statusAr } from "@/components/OrderActionsDialog";
import OrderReceiptDialog from "@/components/OrderReceiptDialog";

const TYPE_AR: Record<string, string> = {
  SALE: "بيع",
  LOYALTY_REWARD: "مكافأة ولاء",
  STAFF_DRINK: "مشروب موظف",
  COMPLIMENTARY: "مجاني",
};

export default function OrdersTable({
  orders,
  currency,
}: {
  orders: OrderRow[];
  currency: string;
}) {
  const [selected, setSelected] = useState<OrderRow | null>(null);
  // فتح الفاتورة متاحٌ لكل صفّ، حتى الملغاة ومشروب الموظّف: السؤال
  // «ما الذي نقص ولماذا» يخصّها هي قبل غيرها.
  const [receipt, setReceipt] = useState<OrderRow | null>(null);
  const router = useRouter();

  if (orders.length === 0) {
    return <p className="card p-8 text-center text-sm text-muted">لا طلبات في هذا اليوم.</p>;
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-right text-xs text-muted">
              <th className="p-3 font-medium">#</th>
              <th className="p-3 font-medium">الوقت</th>
              <th className="p-3 font-medium">النوع</th>
              <th className="p-3 font-medium">الموظف</th>
              <th className="p-3 font-medium">الإجمالي</th>
              <th className="p-3 font-medium">الحالة</th>
              <th className="p-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const dim = ["VOIDED", "CANCELLED"].includes(o.status);
              return (
                <tr key={o.id} className={`border-b border-line/60 ${dim ? "opacity-50" : ""}`}>
                  <td className="p-3">
                    <button
                      onClick={() => setReceipt(o)}
                      className="nums font-semibold text-accentdeep underline underline-offset-2"
                    >
                      {o.order_number}
                    </button>
                  </td>
                  <td className="nums p-3 text-muted">{timeAr(o.created_at)}</td>
                  <td className="p-3 text-muted">{TYPE_AR[o.order_type] ?? o.order_type}</td>
                  <td className="p-3 text-muted">{o.employee_name}</td>
                  <td className="nums p-3 font-medium text-ink">
                    {money(o.total, currency)}
                    {o.refunded > 0 && (
                      <span className="mr-1 text-xs text-red-600">−{money(o.refunded, currency)}</span>
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`chip ${
                        o.status === "COMPLETED" || o.status === "PAID"
                          ? "bg-green-50 text-green-800"
                          : o.status === "VOIDED" || o.status === "CANCELLED"
                            ? "bg-dark/5 text-muted"
                            : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {statusAr(o.status)}
                    </span>
                  </td>
                  <td className="p-3 text-left">
                    <div className="flex justify-end gap-3">
                      <button
                        onClick={() => setReceipt(o)}
                        className="text-xs font-medium text-muted underline"
                      >
                        الفاتورة
                      </button>
                      {o.order_type === "SALE" && !["VOIDED", "CANCELLED"].includes(o.status) && (
                        <button
                          onClick={() => setSelected(o)}
                          className="text-xs font-medium text-accent underline"
                        >
                          إجراء
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {receipt && (
        <OrderReceiptDialog
          orderId={receipt.id}
          currency={currency}
          onClose={() => setReceipt(null)}
        />
      )}

      {selected && (
        <OrderActionsDialog
          order={selected}
          currency={currency}
          onClose={() => setSelected(null)}
          onDone={() => {
            setSelected(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
