"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { money } from "@/lib/format";
import type { CatalogProduct } from "@/lib/catalog";
import PaymentDialog from "@/components/PaymentDialog";
import ShiftControls from "@/components/ShiftControls";
import StaffDrinkDialog from "@/components/StaffDrinkDialog";
import ModifierSheet from "@/components/ModifierSheet";
import CustomerPanel, { type LinkedCustomer } from "@/components/CustomerPanel";

export type CartOption = { id: string; name: string; price_delta: number };
export type CartLine = {
  key: string;
  product_id: string;
  name: string;
  crop_material_id: string;
  crop_name: string;
  unit_price: number;
  options: CartOption[];
  qty: number;
};

type Fulfillment = "takeaway" | "dine_in";

const CATS: { key: string; label: string }[] = [
  { key: "espresso", label: "إسبريسو" },
  { key: "hot", label: "ساخن" },
  { key: "cold", label: "بارد" },
  { key: "filter", label: "مختص" },
  { key: "other", label: "أخرى" },
];
const PARK_KEY = "khazf_parked_v1";

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
  const cats = useMemo(() => CATS.filter((c) => catalog.some((p) => (p.category || "other") === c.key)), [catalog]);
  const [cat, setCat] = useState<string>(cats[0]?.key ?? "espresso");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [fulfillment, setFulfillment] = useState<Fulfillment>("takeaway");
  const [sheetFor, setSheetFor] = useState<CatalogProduct | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [staffOpen, setStaffOpen] = useState(false);
  const [parkedCount, setParkedCount] = useState(0);
  const [showParked, setShowParked] = useState(false);
  // ولاء الزبون (§38): يُربط بالفاتورة قبل الدفع، والأختام تُحتسب في القاعدة.
  const [customerOpen, setCustomerOpen] = useState(false);
  const [customer, setCustomer] = useState<LinkedCustomer | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => { setParkedCount(readParked().length); }, []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.qty, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  const shown = useMemo(() => catalog.filter((p) => (p.category || "other") === cat), [catalog, cat]);

  function addLine(l: Omit<CartLine, "key" | "qty">) {
    const key = `${l.product_id}:${l.crop_material_id}:${l.options.map((o) => o.id).sort().join(",")}`;
    setLines((prev) => {
      const found = prev.find((x) => x.key === key);
      if (found) return prev.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x));
      return [...prev, { ...l, key, qty: 1 }];
    });
  }

  function onProduct(p: CatalogProduct) {
    if (p.paused) return;
    const avail = p.crops.filter((c) => c.available);
    if (avail.length === 0) return;
    // بلا خيارات ومحصول واحد → إضافة مباشرة
    if (avail.length === 1 && p.groups.length === 0) {
      addLine({ product_id: p.id, name: p.name, crop_material_id: avail[0].material_id, crop_name: avail[0].crop_name, unit_price: avail[0].price, options: [] });
    } else {
      setSheetFor(p);
    }
  }

  function changeQty(key: string, d: number) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty + d } : l)).filter((l) => l.qty > 0));
  }
  function clearCart() { setLines([]); setFulfillment("takeaway"); setCustomer(null); }

  function park() {
    if (lines.length === 0) return;
    const parked = readParked();
    parked.push({ at: Date.now(), fulfillment, lines });
    writeParked(parked);
    setParkedCount(parked.length);
    clearCart();
  }
  function recall(idx: number) {
    const parked = readParked();
    const p = parked[idx];
    if (!p) return;
    parked.splice(idx, 1);
    writeParked(parked);
    setParkedCount(parked.length);
    setLines(p.lines);
    setFulfillment(p.fulfillment);
    setShowParked(false);
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row" dir="rtl">
      {/* الجانب: المنتجات */}
      <section className="flex flex-1 flex-col">
        <header className="topbar sticky top-0 z-10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <Link href="/" className="tap chip border border-cream/20 bg-cream/5 text-cream/80">→ الرئيسية</Link>
              <h1 className="font-display text-lg font-bold text-cream">خزف <span className="text-sm font-normal text-cream/50">· {userName}</span></h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setCustomerOpen(true)}
                className={`tap chip border ${customer ? "border-green-400/40 bg-green-400/15 text-green-200" : "border-cream/20 bg-cream/5 text-cream/80"}`}>
                {customer ? `ولاء · ${customer.stamps}` : "ولاء"}
              </button>
              <button onClick={() => setStaffOpen(true)} className="tap chip border border-cream/20 bg-cream/5 text-cream/80">مشروب موظف</button>
              <ShiftControls openingFloat={shift.opening_float} currency={currency} />
            </div>
          </div>
        </header>

        {/* تبويبات الفئات */}
        <div className="sticky top-[52px] z-10 flex gap-2 overflow-x-auto border-b border-line bg-sand/95 px-4 py-3 backdrop-blur">
          {cats.map((c) => (
            <button key={c.key} onClick={() => setCat(c.key)}
              className={`tap whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${cat === c.key ? "bg-dark text-cream" : "bg-cream text-muted border border-line"}`}>
              {c.label}
            </button>
          ))}
        </div>

        <div className="grid flex-1 grid-cols-2 content-start gap-3 p-4 sm:grid-cols-3">
          {shown.map((p) => {
            const avail = p.crops.filter((c) => c.available);
            const from = avail.length ? Math.min(...avail.map((c) => c.price)) : 0;
            const disabled = p.paused || avail.length === 0;
            return (
              <button key={p.id} onClick={() => onProduct(p)} disabled={disabled}
                className="tap card flex h-28 flex-col items-center justify-center px-2 text-center hover:border-accent/40 disabled:opacity-40">
                <span className="font-display text-base font-bold text-ink">{p.name}</span>
                <span className="nums mt-1 text-xs text-muted">{avail.length > 1 ? "من " : ""}{money(from, currency)}</span>
                {(p.groups.length > 0 || avail.length > 1) && !p.paused && (
                  <span className="mt-1 text-[10px] text-accent">خيارات</span>
                )}
                {p.paused && <span className="mt-1 chip bg-amber-100 text-amber-700">موقوف</span>}
              </button>
            );
          })}
        </div>
      </section>

      {/* التذكرة */}
      <aside className="flex w-full flex-col border-t border-line bg-sandalt lg:w-[340px] lg:border-r lg:border-t-0">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="font-display font-bold text-ink">الطلب الحالي</h2>
          <div className="flex items-center gap-3">
            {parkedCount > 0 && (
              <button onClick={() => setShowParked(true)} className="text-xs text-accent">معلّقة ({parkedCount})</button>
            )}
            {lines.length > 0 && <button onClick={clearCart} className="text-xs text-muted">تفريغ</button>}
          </div>
        </div>

        {customer && (
          <div className="mx-4 mt-3 flex items-center justify-between rounded-xl bg-green-50 px-3 py-2">
            <span className="text-xs font-medium text-green-800">
              ولاء: <span className="nums">{customer.phone}</span>
              {customer.name ? ` · ${customer.name}` : ""}
            </span>
            <button onClick={() => setCustomer(null)} className="text-xs text-green-700 underline">إزالة</button>
          </div>
        )}

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
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-display text-sm font-bold text-ink">{l.name}</span>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {l.crop_name}{l.options.length ? " · " + l.options.map((o) => o.name).join(" · ") : ""}
                    </div>
                  </div>
                  <span className="nums text-sm font-medium text-ink">{money(l.unit_price * l.qty, currency)}</span>
                </div>
                <div className="mt-2 flex items-center justify-end gap-2 nums" dir="ltr">
                  <Step onClick={() => changeQty(l.key, -1)}>−</Step>
                  <span className="w-6 text-center text-sm">{l.qty}</span>
                  <Step onClick={() => changeQty(l.key, +1)}>+</Step>
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
          <div className="grid grid-cols-3 gap-2">
            <button onClick={park} disabled={lines.length === 0} className="btn-ghost col-span-1 py-4 text-sm disabled:opacity-40">تعليق</button>
            <button onClick={() => setPayOpen(true)} disabled={lines.length === 0} className="btn-primary col-span-2 text-lg">الدفع</button>
          </div>
        </div>
      </aside>

      {sheetFor && (
        <ModifierSheet product={sheetFor} currency={currency} onClose={() => setSheetFor(null)}
          onAdd={(l) => { addLine(l); setSheetFor(null); }} />
      )}
      {payOpen && (
        <PaymentDialog lines={lines} total={total} fulfillment={fulfillment} currency={currency}
          customerId={customer?.id ?? null}
          onClose={() => setPayOpen(false)} onPaid={() => { setPayOpen(false); clearCart(); }} />
      )}
      {staffOpen && <StaffDrinkDialog catalog={catalog} onClose={() => setStaffOpen(false)} />}
      {customerOpen && (
        <CustomerPanel
          catalog={catalog}
          fulfillment={fulfillment}
          linked={customer}
          onLink={setCustomer}
          onUnlink={() => { setCustomer(null); setCustomerOpen(false); }}
          onRedeemed={(n) => {
            setCustomerOpen(false);
            setCustomer(null);
            setFlash(`صُرفت المكافأة — فاتورة #${n}`);
            setTimeout(() => setFlash(null), 4000);
          }}
          onClose={() => setCustomerOpen(false)}
        />
      )}
      {flash && (
        <div className="fixed inset-x-0 bottom-6 z-50 mx-auto w-fit rounded-2xl bg-dark px-5 py-3 text-sm font-semibold text-cream shadow-lift">
          {flash}
        </div>
      )}
      {showParked && (
        <ParkedList currency={currency} onClose={() => setShowParked(false)} onRecall={recall} />
      )}
    </div>
  );
}

function ParkedList({ currency, onClose, onRecall }: { currency: string; onClose: () => void; onRecall: (i: number) => void }) {
  const parked = readParked();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-dark/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="w-full max-w-sm rounded-t-3xl bg-sand p-6 shadow-lift sm:rounded-3xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">الطلبات المعلّقة</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-dark/5 text-muted">✕</button>
        </div>
        {parked.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted">لا شيء.</p>
        ) : (
          <div className="space-y-2">
            {parked.map((p, i) => {
              const t = p.lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
              return (
                <button key={i} onClick={() => onRecall(i)} className="tap w-full rounded-xl border border-line bg-cream p-3 text-right">
                  <div className="flex justify-between">
                    <span className="text-sm text-ink">{p.lines.map((l) => `${l.name}${l.qty > 1 ? ` ×${l.qty}` : ""}`).join(" · ")}</span>
                    <span className="nums text-sm font-medium text-accent">{money(t, currency)}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

type Parked = { at: number; fulfillment: Fulfillment; lines: CartLine[] };
function readParked(): Parked[] {
  try { return JSON.parse(localStorage.getItem(PARK_KEY) || "[]"); } catch { return []; }
}
function writeParked(p: Parked[]) {
  try { localStorage.setItem(PARK_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`tap rounded-lg py-2 text-sm font-medium ${active ? "bg-cream text-ink shadow-soft" : "text-muted"}`}>{children}</button>
  );
}
function Step({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="tap flex h-7 w-7 items-center justify-center rounded-lg border border-line bg-cream text-lg leading-none text-ink">{children}</button>
  );
}
