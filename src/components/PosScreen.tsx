"use client";

import { useMemo, useState } from "react";
import type { CartLine, Drink, DrinkCategory, PaymentMethod, ReceiptData, ServiceType } from "@/lib/types";
import { categoryLabel, money } from "@/lib/format";
import PaymentDialog from "./PaymentDialog";
import Receipt from "./Receipt";

const CATEGORIES: DrinkCategory[] = ["hot", "cold", "espresso", "other"];

type Props = {
  drinks: Drink[];
  currency: string;
  shopName: string;
  shopPhone: string;
  extraShotPrice: number;
};

export default function PosScreen({ drinks, currency, shopName, shopPhone, extraShotPrice }: Props) {
  const [service, setService] = useState<ServiceType>("takeaway");
  const [tab, setTab] = useState<DrinkCategory | "all">("all");
  const [lines, setLines] = useState<CartLine[]>([]);
  const [payOpen, setPayOpen] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const shown = useMemo(
    () => (tab === "all" ? drinks : drinks.filter((d) => d.category === tab)),
    [drinks, tab],
  );

  // الباريستا يرى مبلغ الطلب الحالي فقط — لا أي رقم تراكمي.
  const total = lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
  const count = lines.reduce((s, l) => s + l.qty, 0);

  function lineKey(drinkId: string, svc: ServiceType, shots: number) {
    return `${drinkId}|${svc}|${shots}`;
  }

  function addDrink(d: Drink) {
    const key = lineKey(d.id, service, 0);
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...prev,
        { key, drink_id: d.id, name: d.name, unit_price: d.price, qty: 1, service, extra_shots: 0 },
      ];
    });
  }

  function bump(key: string, delta: number) {
    setLines((prev) =>
      prev.flatMap((l) => {
        if (l.key !== key) return [l];
        const q = l.qty + delta;
        return q <= 0 ? [] : [{ ...l, qty: q }];
      }),
    );
  }

  function addShot(line: CartLine) {
    const shots = line.extra_shots + 1;
    const key = lineKey(line.drink_id, line.service, shots);
    setLines((prev) => {
      // ننقل حبة واحدة من السطر الحالي إلى سطر بشوت إضافي
      const rest = prev.flatMap((l) =>
        l.key === line.key ? (l.qty - 1 <= 0 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l],
      );
      const found = rest.find((l) => l.key === key);
      if (found) return rest.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [
        ...rest,
        {
          key,
          drink_id: line.drink_id,
          name: line.name,
          unit_price: line.unit_price + extraShotPrice,
          qty: 1,
          service: line.service,
          extra_shots: shots,
        },
      ];
    });
  }

  function toggleLineService(line: CartLine) {
    const svc: ServiceType = line.service === "takeaway" ? "dinein" : "takeaway";
    const key = lineKey(line.drink_id, svc, line.extra_shots);
    setLines((prev) => {
      const rest = prev.flatMap((l) =>
        l.key === line.key ? (l.qty - 1 <= 0 ? [] : [{ ...l, qty: l.qty - 1 }]) : [l],
      );
      const found = rest.find((l) => l.key === key);
      if (found) return rest.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...rest, { ...line, key, service: svc, qty: 1 }];
    });
  }

  function clearCart() {
    setLines([]);
    setCartOpen(false);
  }

  function onPaid(data: ReceiptData) {
    setPayOpen(false);
    setLines([]);
    setCartOpen(false);
    setReceipt(data);
  }

  return (
    <main className="h-[100dvh] flex flex-col lg:flex-row overflow-hidden">
      {/* ------------------------------ شبكة المشروبات ------------------------------ */}
      <section className="flex-1 flex flex-col min-h-0">
        <header className="flex items-center gap-2 p-3 border-b border-line bg-white">
          <h1 className="font-bold text-lg ml-auto">{shopName}</h1>
          <ServiceToggle value={service} onChange={setService} />
        </header>

        <nav className="flex gap-2 p-3 overflow-x-auto border-b border-line bg-white">
          <TabBtn active={tab === "all"} onClick={() => setTab("all")}>
            الكل
          </TabBtn>
          {CATEGORIES.map((c) => (
            <TabBtn key={c} active={tab === c} onClick={() => setTab(c)}>
              {categoryLabel(c)}
            </TabBtn>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto p-3 pb-28 lg:pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
            {shown.map((d) => (
              <button
                key={d.id}
                onClick={() => addDrink(d)}
                className="tap card p-4 min-h-24 text-right hover:border-clay"
              >
                <div className="font-bold text-base leading-tight">{d.name}</div>
                <div className="mt-2 text-sm text-ink/60">{money(d.price, currency)}</div>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="col-span-full text-center text-ink/50 py-10">لا مشروبات في هذه الفئة</p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------ السلة ------------------------------ */}
      <aside
        className={`bg-white border-t lg:border-t-0 lg:border-s border-line lg:w-[360px] flex-col ${
          cartOpen ? "fixed inset-0 z-30 flex" : "hidden lg:flex"
        }`}
      >
        <div className="flex items-center gap-2 p-3 border-b border-line">
          <h2 className="font-bold ml-auto">الطلب الحالي</h2>
          {lines.length > 0 && (
            <button onClick={clearCart} className="tap text-sm text-red-700 px-2 py-1">
              إفراغ
            </button>
          )}
          <button onClick={() => setCartOpen(false)} className="tap lg:hidden text-sm px-2 py-1">
            إغلاق
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {lines.length === 0 && <p className="text-center text-ink/50 py-10">اضغط مشروباً لإضافته</p>}
          {lines.map((l) => (
            <div key={l.key} className="card p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="font-bold">{l.name}</div>
                  <div className="text-xs text-ink/60 mt-1 flex gap-2">
                    <span>{l.service === "takeaway" ? "سفري" : "جلوس"}</span>
                    {l.extra_shots > 0 && <span>+{l.extra_shots} شوت</span>}
                  </div>
                </div>
                <div className="font-bold tabular-nums">{money(l.unit_price * l.qty, currency)}</div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <button onClick={() => bump(l.key, -1)} className="tap w-10 h-10 rounded-lg border border-line text-lg">
                  −
                </button>
                <span className="w-8 text-center font-bold tabular-nums">{l.qty}</span>
                <button onClick={() => bump(l.key, 1)} className="tap w-10 h-10 rounded-lg border border-line text-lg">
                  +
                </button>
                <button onClick={() => addShot(l)} className="tap mr-auto text-xs px-2 py-2 rounded-lg border border-line">
                  + شوت
                </button>
                <button onClick={() => toggleLineService(l)} className="tap text-xs px-2 py-2 rounded-lg border border-line">
                  {l.service === "takeaway" ? "جلوس" : "سفري"}
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-line">
          <div className="flex items-center justify-between mb-3">
            <span className="text-ink/70">المجموع</span>
            <span className="text-2xl font-bold tabular-nums">{money(total, currency)}</span>
          </div>
          <button
            disabled={lines.length === 0}
            onClick={() => setPayOpen(true)}
            className="btn-primary w-full text-lg disabled:opacity-40"
          >
            الدفع
          </button>
        </div>
      </aside>

      {/* شريط سفلي للموبايل */}
      {!cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          disabled={lines.length === 0}
          className="tap lg:hidden fixed bottom-0 inset-x-0 z-20 bg-clay text-white px-4 py-4 flex items-center justify-between disabled:opacity-40"
        >
          <span className="font-bold">السلة ({count})</span>
          <span className="text-lg font-bold tabular-nums">{money(total, currency)}</span>
        </button>
      )}

      {payOpen && (
        <PaymentDialog
          lines={lines}
          total={total}
          currency={currency}
          shopName={shopName}
          shopPhone={shopPhone}
          onCancel={() => setPayOpen(false)}
          onPaid={onPaid}
        />
      )}

      {receipt && <Receipt data={receipt} onClose={() => setReceipt(null)} />}
    </main>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`tap shrink-0 rounded-full px-4 py-2 text-sm font-semibold border ${
        active ? "bg-clay text-white border-clayDark" : "bg-white border-line"
      }`}
    >
      {children}
    </button>
  );
}

function ServiceToggle({ value, onChange }: { value: ServiceType; onChange: (v: ServiceType) => void }) {
  return (
    <div className="flex rounded-xl border border-line overflow-hidden">
      {(["takeaway", "dinein"] as ServiceType[]).map((s) => (
        <button
          key={s}
          onClick={() => onChange(s)}
          className={`tap px-4 py-2 text-sm font-semibold ${value === s ? "bg-clay text-white" : "bg-white"}`}
        >
          {s === "takeaway" ? "سفري" : "جلوس"}
        </button>
      ))}
    </div>
  );
}
