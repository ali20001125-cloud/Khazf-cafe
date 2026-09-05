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

const CAT_LABEL: Record<string, string> = {
  espresso: "إسبريسو",
  hot: "ساخن",
  cold: "بارد",
  filter: "مختص",
  other: "أخرى",
};

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
      return [...prev, { key, product_id: p.id, name: p.name, crop_material_id: crop.material_id, crop_name: crop.crop_name, unit_price: crop.price, qty: 1 }];
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
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty + delta } : l)).filter((l) => l.qty > 0));
  }

  function clearCart() {
    setLines([]);
    setFulfillment("takeaway");
  }

  // تجميع حسب الفئة
  const groups = useMemo(() => {
    const m = new Map<string, CatalogProduct[]>();
    for (const p of catalog) {
      const k = p.category || "other";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [catalog]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" dir="rtl">
      {/* المنتجات */}
      <section className="flex-1">
        <header className="topbar sticky top-0 z-10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-lg font-bold text-cream">
              خزف <span className="text-sm font-normal text-cream/50">· {userName}</span>
            </h1>
            <ShiftControls openingFloat={shift.opening_float} currency={currency} />
          </div>
        </header>

        <div className="space-y-6 p-4">
          {groups.map(([cat, items]) => (
            <div key={cat}>
              <h2 className="mb-2 font-display text-xs font-bold uppercase tracking-wider text-muted">
                {CAT_LABEL[cat] ?? cat}
              </h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {items.map((p) => {
                  const avail = p.crops.filter((c) => c.available);
                  const from = avail.length ? Math.min(...avail.map((c) => c.price)) : 0;
                  const disabled = p.paused || avail.length === 0;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onProduct(p)}
                      disabled={disabled}
                      className="tap card flex h-24 flex-col items-center justify-center px-2 text-center hover:border-accent/40 disabled:opacity-40"
                    >
                      <span className="font-display text-base font-bold text-ink">{p.name}</span>
                      <span className="mt-1 text-xs text-muted nums">
                        {avail.length > 1 ? "من " : ""}
                        {money(from, currency)}
                      </span>
                      {p.paused && <span className="mt-1 chip bg-amber-100 text-amber-700">موقوف</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* السلة */}
      <aside className="flex w-full flex-col border-t border-line bg-sandalt lg:w-80 lg:border-r lg:border-t-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-display font-bold text-ink">الطلب الحالي</h2>
          {lines.length > 0 && (
            <button onClick={clearCart} className="text-xs text-muted">تفريغ</button>
          )}
        </div>

        <div className="mx-4 mt-3 grid grid-cols-2 gap-1 rounded-xl bg-dark/5 p-1">
          <Seg active={fulfillment === "takeaway"} onClick={() => setFulfillment("takeaway")}>سفري</Seg>
          <Seg active={fulfillment === "dine_in"} onClick={() => setFulfillment("dine_in")}>جلوس</Seg>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {lines.length === 0 ? (
            <p className="mt-10 text-center text-sm text-muted">أضف مشروباً للبدء</p>
          ) : (
            lines.map((l) => (
              <div key={l.key} className="card p-3">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-bold text-ink">{l.name}</span>
                  <span className="nums text-sm font-medium text-ink">{money(l.unit_price * l.qty, currency)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-muted">{l.crop_name}</span>
                  <div className="flex items-center gap-2 nums" dir="ltr">
                    <Step onClick={() => changeQty(l.key, -1)}>−</Step>
                    <span className="w-6 text-center text-sm">{l.qty}</span>
                    <Step onClick={() => changeQty(l.key, +1)}>+</Step>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t border-line bg-cream p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted">الإجمالي <span className="nums">({count})</span></span>
            <span className="nums font-display text-2xl font-bold text-ink">{money(total, currency)}</span>
          </div>
          <button onClick={() => setPayOpen(true)} disabled={lines.length === 0} className="btn-primary w-full text-lg">
            الدفع
          </button>
        </div>
      </aside>

      {cropFor && (
        <Modal onClose={() => setCropFor(null)} title={`اختر محصول ${cropFor.name}`}>
          <div className="space-y-2">
            {cropFor.crops.filter((c) => c.available).map((c) => (
              <button
                key={c.material_id}
                onClick={() => { addLine(cropFor, c); setCropFor(null); }}
                className="tap flex w-full items-center justify-between rounded-xl border border-line bg-sand/60 px-4 py-3 hover:border-accent/40"
              >
                <span className="font-display font-bold text-ink">{c.crop_name}</span>
                <span className="nums text-sm text-muted">{money(c.price, currency)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}

      {payOpen && (
        <PaymentDialog
          lines={lines}
          total={total}
          fulfillment={fulfillment}
          currency={currency}
          onClose={() => setPayOpen(false)}
          onPaid={() => { setPayOpen(false); clearCart(); }}
        />
      )}
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

function Step({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="tap flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-cream text-lg leading-none text-ink">
      {children}
    </button>
  );
}
