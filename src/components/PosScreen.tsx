"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { CatalogProduct } from "@/lib/catalog";
import PaymentDialog from "@/components/PaymentDialog";
import Modal from "@/components/Modal";
import ShiftControls from "@/components/ShiftControls";

export type CartLine = {
  key: string;
  product_id: string;
  name: string;
  crop_material_id: string;
  crop_name: string;
  unit_price: number;
  qty: number;
};

type Fulfillment = "takeaway" | "dine_in";

export default function PosScreen({
  catalog,
  currency,
  userName,
  shift,
}: {
  catalog: CatalogProduct[];
  currency: string;
  userName: string;
  shift: { id: string; opening_float: number };
}) {
  const [lines, setLines] = useState<CartLine[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("takeaway");
  const [cropFor, setCropFor] = useState<CatalogProduct | null>(null);
  const [payOpen, setPayOpen] = useState(false);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.qty, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  function addLine(p: CatalogProduct, crop: CatalogProduct["crops"][number]) {
    setLines((prev) => {
      const key = `${p.id}:${crop.material_id}`;
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        {
          key,
          product_id: p.id,
          name: p.name,
          crop_material_id: crop.material_id,
          crop_name: crop.crop_name,
          unit_price: crop.price,
          qty: 1,
        },
      ];
    });
  }

  function onProduct(p: CatalogProduct) {
    if (p.paused) return;
    const avail = p.crops.filter((c) => c.available);
    if (avail.length === 0) return;
    if (avail.length === 1) addLine(p, avail[0]);
    else setCropFor(p);
  }

  function changeQty(key: string, delta: number) {
    setLines((prev) =>
      prev
        .map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l))
        .filter((l) => l.qty > 0)
    );
  }

  function clearCart() {
    setLines([]);
    setFulfillment("takeaway");
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col lg:flex-row" dir="rtl">
      {/* شبكة المشروبات */}
      <section className="flex-1 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-[#5b4636]">
            البيع <span className="text-xs font-normal text-neutral-400">· {userName}</span>
          </h1>
          <ShiftControls openingFloat={shift.opening_float} currency={currency} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {catalog.map((p) => {
            const avail = p.crops.filter((c) => c.available);
            const from = avail.length ? Math.min(...avail.map((c) => c.price)) : 0;
            const disabled = p.paused || avail.length === 0;
            return (
              <button
                key={p.id}
                onClick={() => onProduct(p)}
                disabled={disabled}
                className="flex h-24 flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white p-2 text-center shadow-sm active:scale-95 disabled:opacity-40"
              >
                <span className="text-base font-semibold text-[#5b4636]">{p.name}</span>
                <span className="mt-1 text-xs text-neutral-500">
                  {avail.length > 1 ? "من " : ""}
                  {money(from, currency)}
                </span>
                {p.paused && <span className="mt-0.5 text-[10px] text-amber-600">موقوف</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* السلة */}
      <aside className="flex w-full flex-col border-t border-neutral-200 bg-neutral-50 lg:w-80 lg:border-r lg:border-t-0">
        <div className="flex items-center justify-between p-4 pb-2">
          <h2 className="font-semibold text-[#5b4636]">الطلب الحالي</h2>
          {lines.length > 0 && (
            <button onClick={clearCart} className="text-xs text-neutral-400">
              تفريغ
            </button>
          )}
        </div>

        {/* سفري / جلوس */}
        <div className="mx-4 mb-2 grid grid-cols-2 gap-2">
          <Toggle active={fulfillment === "takeaway"} onClick={() => setFulfillment("takeaway")}>
            سفري
          </Toggle>
          <Toggle active={fulfillment === "dine_in"} onClick={() => setFulfillment("dine_in")}>
            جلوس
          </Toggle>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto px-4">
          {lines.length === 0 ? (
            <p className="mt-8 text-center text-sm text-neutral-400">أضف مشروباً للبدء</p>
          ) : (
            lines.map((l) => (
              <div key={l.key} className="rounded-lg border border-neutral-200 bg-white p-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#5b4636]">{l.name}</span>
                  <span className="text-sm text-neutral-600">{money(l.unit_price * l.qty, currency)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-xs text-neutral-400">{l.crop_name}</span>
                  <div className="flex items-center gap-2" dir="ltr">
                    <StepBtn onClick={() => changeQty(l.key, -1)}>−</StepBtn>
                    <span className="w-6 text-center text-sm">{l.qty}</span>
                    <StepBtn onClick={() => changeQty(l.key, +1)}>+</StepBtn>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-neutral-200 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm text-neutral-500">الإجمالي ({count})</span>
            <span className="text-xl font-bold text-[#5b4636]">{money(total, currency)}</span>
          </div>
          <button
            onClick={() => setPayOpen(true)}
            disabled={lines.length === 0}
            className="w-full rounded-xl bg-[#8a6a4f] py-4 text-lg font-semibold text-white active:scale-[0.99] disabled:opacity-40"
          >
            الدفع
          </button>
        </div>
      </aside>

      {/* اختيار المحصول */}
      {cropFor && (
        <Modal onClose={() => setCropFor(null)} title={`اختر محصول ${cropFor.name}`}>
          <div className="space-y-2">
            {cropFor.crops
              .filter((c) => c.available)
              .map((c) => (
                <button
                  key={c.material_id}
                  onClick={() => {
                    addLine(cropFor, c);
                    setCropFor(null);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3"
                >
                  <span className="font-medium text-[#5b4636]">{c.crop_name}</span>
                  <span className="text-sm text-neutral-600">{money(c.price, currency)}</span>
                </button>
              ))}
          </div>
        </Modal>
      )}

      {/* الدفع */}
      {payOpen && (
        <PaymentDialog
          lines={lines}
          total={total}
          fulfillment={fulfillment}
          currency={currency}
          onClose={() => setPayOpen(false)}
          onPaid={() => {
            setPayOpen(false);
            clearCart();
          }}
        />
      )}
    </div>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg py-2 text-sm font-medium ${
        active ? "bg-[#8a6a4f] text-white" : "bg-white text-neutral-600 border border-neutral-200"
      }`}
    >
      {children}
    </button>
  );
}

function StepBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="h-7 w-7 rounded-md border border-neutral-200 bg-white text-lg leading-none text-[#5b4636] active:scale-90"
    >
      {children}
    </button>
  );
}

