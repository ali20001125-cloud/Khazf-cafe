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
import { HandoverInbox } from "@/components/DrawerDialogs";
import OfflineSync from "@/components/OfflineSync";

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

const PARK_KEY = "khazf_parked_v1";

export default function PosScreen({
  catalog,
  sellRank,
  currency,
  userName,
  countedBy,
  pinIsDefault,
  shift,
  canNoSale = false,
  canHandover = false,
  canManage = false,
  pendingHandover = null,
}: {
  catalog: CatalogProduct[];
  /** أكواب كل مشروب في آخر ٣٠ يوماً — يرتّب الشبكة بالأكثر طلباً. */
  sellRank: Record<string, number>;
  currency: string;
  userName: string;
  /** من يعدّ الدرج عند الإغلاق — يقرّره المالك (هجرة 0026). */
  countedBy: "barista" | "owner" | "none";
  /** رمزه ما زال الافتراضي (0000) — نطالبه بتغييره في شاشته، لأن لوحة
   *  الإدارة مقفلة عليه فلا يصله تحذير المالك. */
  pinIsDefault: boolean;
  shift: { id: string; opening_float: number };
  canNoSale?: boolean;
  canHandover?: boolean;
  /** يملك لوحة الإدارة — فله وحده منفذٌ إليها، وهو تحت «المزيد» لا في الشريط. */
  canManage?: boolean;
  pendingHandover?: { id: string; from_name: string } | null;
}) {
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
  const [added, setAdded] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => { setParkedCount(readParked().length); }, []);

  const total = useMemo(() => lines.reduce((s, l) => s + l.unit_price * l.qty, 0), [lines]);
  const count = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  // كم كوباً من كل مشروب في التذكرة — يُعرض على البطاقة نفسها، فلا يحتاج
  // الباريستا أن ينقل عينه إلى التذكرة ليتأكّد.
  const inCart = useMemo(() => {
    const m: Record<string, number> = {};
    for (const l of lines) m[l.product_id] = (m[l.product_id] ?? 0) + l.qty;
    return m;
  }, [lines]);
  // كل المشروبات في شبكة واحدة: المقهى فيه عشرات المشروبات لا مئات،
  // والتبويبات تضيف ضغطة قبل كل طلب بلا فائدة.
  //
  // والترتيب: المتاح أولاً، ثم **الأكثر مبيعاً فعلاً** — لا ترتيب يدوي
  // يضعه أحد مرّة وينساه. القائمة ترتّب نفسها كلّما تغيّر ذوق الزبائن،
  // فيقع الأكثر طلباً تحت الإبهام. والموقوف والفارغ في الآخر.
  const shown = useMemo(() => {
    const rank = (p: CatalogProduct) => {
      const avail = p.crops.filter((c) => c.available);
      const left = avail.reduce(
        (m, c) => Math.max(m, fulfillment === "takeaway" ? c.servings_takeaway : c.servings_dine_in),
        0
      );
      if (p.paused || avail.length === 0) return 2;
      return left === 0 ? 1 : 0;
    };
    return [...catalog].sort(
      (a, b) => rank(a) - rank(b) || (sellRank[b.id] ?? 0) - (sellRank[a.id] ?? 0)
    );
  }, [catalog, sellRank, fulfillment]);

  function addLine(l: Omit<CartLine, "key" | "qty">) {
    const key = `${l.product_id}:${l.crop_material_id}:${l.options.map((o) => o.id).sort().join(",")}`;
    setLines((prev) => {
      const found = prev.find((x) => x.key === key);
      if (found) return prev.map((x) => (x.key === key ? { ...x, qty: x.qty + 1 } : x));
      return [...prev, { ...l, key, qty: 1 }];
    });
    // تأكيد فوري: عين الباريستا على الشبكة لا على التذكرة، فلو لم يرَ أثراً
    // ضغط ثانيةً — ويصير كوبان. والاهتزاز يصل ولو كانت اليد مشغولة.
    setAdded(key);
    window.setTimeout(() => setAdded((k) => (k === key ? null : k)), 450);
    if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(12);
  }

  function onProduct(p: CatalogProduct) {
    if (p.paused) return;
    const servings = (c: CatalogProduct["crops"][number]) =>
      fulfillment === "takeaway" ? c.servings_takeaway : c.servings_dine_in;
    const avail = p.crops.filter((c) => c.available && servings(c) > 0);
    if (avail.length === 0) return;
    // بلا خيارات ومحصول واحد → إضافة مباشرة بلا حوار.
    // (المجموعات الإلزامية لها افتراضي داخل الحوار، لكن فتحه يبقى ضرورياً
    //  ما دام فيها خيارٌ يُبدَّل — الافتراضي يُسرِّع الحوار لا يُلغيه.)
    if (avail.length === 1 && p.groups.length === 0) {
      addLine({
        product_id: p.id, name: p.name,
        crop_material_id: avail[0].material_id, crop_name: avail[0].crop_name,
        unit_price: avail[0].price, options: [],
      });
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
    // `md` لا `lg`: الآيباد العمودي ٧٦٨ بكسل، وكان يقع تحت العتبة فتنزل
    // التذكرة خارج الشاشة — يضغط الباريستا مشروباً فلا يرى شيئاً.
    <div className="flex h-[100dvh] flex-col overflow-hidden md:flex-row" dir="rtl">
      {/* الجانب: المنتجات */}
      <section className="flex min-h-0 flex-1 flex-col">
        {pendingHandover && (
          <HandoverInbox handoverId={pendingHandover.id} fromName={pendingHandover.from_name} />
        )}
        <header className="topbar sticky top-0 z-10 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* لا مخرج من الكاشير في الشريط الأعلى: ضغطةٌ بالغلط وسط بيعة
                تُخرج الباريستا وتُفقد السلّة، وهو لا يعرف أين ذهبت. المنفذ
                الوحيد للوحة الإدارة تحت «المزيد»، ولمن يملكها. */}
            <div className="flex items-center gap-3">
              <h1 className="font-display text-lg font-bold text-cream">خزف <span className="text-sm font-normal text-cream/50">· {userName}</span></h1>
            </div>
            {/* ثلاثة عناصر لا عشرة: الشريط الأعلى أثمن مساحة في الشاشة،
                وكل زرّ فيه يسرق نظرةً من المشروبات. ما يُستعمل مرّةً في
                الوردية ينزل تحت «المزيد». */}
            <div className="flex items-center gap-2">
              {pinIsDefault && (
                <span
                  className="chip border border-red-400/50 bg-red-400/20 text-red-100"
                  title="رمزك يضعه المالك — اطلب منه تغييره"
                >
                  رمزك افتراضي
                </span>
              )}
              <button
                onClick={() => setCustomerOpen(true)}
                className={`tap chip border ${
                  customer
                    ? "border-green-400/40 bg-green-400/15 text-green-200"
                    : "border-cream/20 bg-cream/5 text-cream/80"
                }`}
              >
                {customer ? `ولاء · ${customer.stamps}` : "ولاء"}
              </button>
              <button
                onClick={() => setMoreOpen(true)}
                aria-label="المزيد"
                className="tap chip border border-cream/20 bg-cream/5 text-cream/80"
              >
                المزيد ⋯
              </button>
            </div>
          </div>
        </header>

        <OfflineSync currency={currency} />

        <div className="grid min-h-0 flex-1 content-start gap-2.5 overflow-y-auto p-3 grid-cols-[repeat(auto-fill,minmax(8.25rem,1fr))]">
          {shown.map((p) => {
            const avail = p.crops.filter((c) => c.available);
            const from = avail.length ? Math.min(...avail.map((c) => c.price)) : 0;
            // المخزون الحقيقي لا راية المالك وحدها: أكثر ما يمكن تحضيره من
            // هذا المشروب بأيّ محصول متاح، بحسب طريقة التقديم المختارة.
            const left = avail.reduce(
              (m, c) => Math.max(m, fulfillment === "takeaway" ? c.servings_takeaway : c.servings_dine_in),
              0
            );
            const outOfStock = avail.length > 0 && left === 0;
            const disabled = p.paused || avail.length === 0 || outOfStock;
            const justAdded = added != null && added.startsWith(`${p.id}:`);
            return (
              <button
                key={p.id}
                onClick={() => onProduct(p)}
                disabled={disabled}
                className={`tap card relative flex min-h-[6.5rem] flex-col items-center justify-center gap-1 px-2 py-3 text-center transition-colors ${
                  disabled
                    ? "opacity-45"
                    : justAdded
                      ? "border-accent bg-accent/15"
                      : "hover:border-accent/40 active:border-accent"
                }`}
              >
                {inCart[p.id] > 0 && (
                  <span className="nums absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-bold text-cream">
                    {inCart[p.id]}
                  </span>
                )}
                <span className="font-display text-[15px] font-bold leading-tight text-ink">{p.name}</span>
                <span className="nums text-xs text-muted">
                  {avail.length > 1 ? "من " : ""}
                  {money(from, currency)}
                </span>
                {p.paused ? (
                  <span className="chip bg-amber-100 text-amber-700">موقوف</span>
                ) : outOfStock ? (
                  <span className="chip bg-red-100 text-red-700">
                    {(() => {
                      // «خلصت مادته» وحدها تُرجع الباريستا للتخمين. نسمّي
                      // المادة التي حدّت العدد، فيعرف ما يُشترى في سطرٍ واحد.
                      const blocked = p.crops
                        .map((c) => (fulfillment === "takeaway" ? c.blocker_takeaway : c.blocker_dine_in))
                        .filter(Boolean) as string[];
                      return blocked.length ? `ينقص ${blocked[0]}` : "خلصت مادته";
                    })()}
                  </span>
                ) : left > 0 && left <= 5 ? (
                  <span className="nums chip bg-amber-100 text-amber-800">باقي {left}</span>
                ) : (p.groups.length > 0 || avail.length > 1) ? (
                  <span className="text-[10px] text-accent">خيارات</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      {/* التذكرة */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col border-t border-line bg-sandalt md:w-[17rem] md:border-r md:border-t-0 lg:w-[21rem]">
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
                  <Step onClick={() => changeQty(l.key, -1)} label={`أنقص ${l.name}`}>−</Step>
                  <span className="w-8 text-center text-base font-semibold">{l.qty}</span>
                  <Step onClick={() => changeQty(l.key, +1)} label={`زد ${l.name}`}>+</Step>
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
        <ModifierSheet product={sheetFor} currency={currency} fulfillment={fulfillment}
          onClose={() => setSheetFor(null)}
          onAdd={(l) => { addLine(l); setSheetFor(null); }} />
      )}
      {payOpen && (
        <PaymentDialog lines={lines} total={total} fulfillment={fulfillment} currency={currency}
          customerId={customer?.id ?? null} shiftId={shift.id}
          onClose={() => setPayOpen(false)} onPaid={() => { setPayOpen(false); clearCart(); }} />
      )}
      {moreOpen && (
        <MoreSheet
          openingFloat={shift.opening_float}
          currency={currency}
          canNoSale={canNoSale}
          canHandover={canHandover}
          countedBy={countedBy}
          pinIsDefault={pinIsDefault}
          canManage={canManage}
          onStaffDrink={() => { setMoreOpen(false); setStaffOpen(true); }}
          onClose={() => setMoreOpen(false)}
        />
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

/**
 * «المزيد» — ما يُستعمل مرّةً أو مرّتين في الوردية.
 * إخراجه من الشريط الأعلى لم يُخفه: صار في مكانٍ واحد متوقّع بدل ستّة أزرار
 * متراصّة تُقرأ كلّها قبل كل طلب.
 */
function MoreSheet({
  openingFloat,
  currency,
  canNoSale,
  canHandover,
  countedBy,
  pinIsDefault,
  canManage,
  onStaffDrink,
  onClose,
}: {
  openingFloat: number;
  currency: string;
  canNoSale: boolean;
  canHandover: boolean;
  countedBy: "barista" | "owner" | "none";
  pinIsDefault: boolean;
  canManage: boolean;
  onStaffDrink: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-dark/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl bg-sand p-5 shadow-lift sm:rounded-3xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">المزيد</h3>
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="tap flex h-11 w-11 items-center justify-center rounded-full bg-dark/5 text-muted"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 nums rounded-xl bg-dark/5 px-3 py-2 text-center text-sm text-muted">
          فكّة الوردية {money(openingFloat, currency)}
        </p>

        <div className="space-y-2">
          <button onClick={onStaffDrink} className="btn-ghost w-full py-4 text-right">
            مشروب موظف
          </button>
          {canManage && (
            <Link href="/manage" className="btn-ghost block w-full py-4 text-right">
              لوحة الإدارة
            </Link>
          )}
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <ShiftControls
            openingFloat={openingFloat}
            currency={currency}
            canNoSale={canNoSale}
            canHandover={canHandover}
            countedBy={countedBy}
            layout="list"
          />
        </div>
      </div>
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
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`tap rounded-lg py-3 text-sm font-semibold ${
        active ? "bg-cream text-ink shadow-soft" : "text-muted"
      }`}
    >
      {children}
    </button>
  );
}
/**
 * زرّ الكمية. ١١ × ٢٫٧٥ = ٤٤ بكسل — الحدّ الأدنى لهدف اللمس. كان ٢٨،
 * فيضغط الإبهام ناقصاً ويصيب الزيادة.
 */
function Step({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="tap flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-cream text-xl leading-none text-ink active:bg-sand"
    >
      {children}
    </button>
  );
}
