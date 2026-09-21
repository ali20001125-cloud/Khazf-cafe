"use client";

import { useMemo, useState, useTransition } from "react";
import { checkPromoAction } from "@/app/manage/promo-actions";
import { money } from "@/lib/format";
import Modal from "@/components/Modal";
import type { CartLine } from "@/components/PosScreen";
import Receipt, { type ReceiptInfo } from "@/components/Receipt";
import { pay } from "@/app/pos/actions";
import { enqueue } from "@/lib/offline-queue";

type Method = "cash" | "card";

export default function PaymentDialog({
  lines,
  total,
  fulfillment,
  currency,
  customerId,
  shiftId,
  onClose,
  onPaid,
}: {
  lines: CartLine[];
  total: number;
  fulfillment: "takeaway" | "dine_in";
  currency: string;
  /** حساب الولاء المربوط — الأختام تُحتسب داخل معاملة البيع نفسها (§59). */
  customerId?: string | null;
  /** وردية البيع — تُحفظ مع الفاتورة المؤجّلة لتُرفع إلى ورديتها هي. */
  shiftId: string;
  onClose: () => void;
  onPaid: () => void;
}) {
  const [method, setMethod] = useState<Method>("cash");
  const [promo, setPromo] = useState("");
  const [promoOk, setPromoOk] = useState<{ code: string; discount: number } | null>(null);
  const [promoErr, setPromoErr] = useState<string | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [tendered, setTendered] = useState<string>("");

  // ما يُدفع فعلاً. والفكّة تُحسب عليه لا على الأصل — وإلّا رُدّ للزبون
  // فرقٌ لم يدفعه.
  const due = Math.max(0, total - (promoOk?.discount ?? 0));
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptInfo | null>(null);
  const [pending, start] = useTransition();
  const [idemKey] = useState(() =>
    typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  );

  const tenderedNum = tendered === "" ? null : Number(tendered);
  const change = useMemo(() => {
    if (method !== "cash" || tenderedNum == null) return null;
    return tenderedNum - due;
  }, [method, tenderedNum, due]);

  const quick = useMemo(() => {
    const set = new Set<number>([due]);
    for (const step of [1000, 5000, 10000, 25000, 50000]) set.add(Math.ceil(due / step) * step);
    return [...set].filter((n) => n >= due).sort((a, b) => a - b).slice(0, 4);
  }, [due]);

  async function applyPromo() {
    if (promoBusy) return;
    setPromoErr(null);
    // **الكود يحتاج شبكة.** سقفه يُحجَز في القاعدة لحظة البيع، وبيعٌ
    // بلا إنترنت يُرفع غداً قد يكون الكود نفد بينهما. فالرفض هنا
    // أوضح من خصمٍ يُعد ثم يُسحب.
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      setPromoErr("الكود يحتاج إنترنت");
      return;
    }
    setPromoBusy(true);
    const res = await checkPromoAction(promo, total);
    setPromoBusy(false);
    if (!res.ok) {
      setPromoOk(null);
      return setPromoErr(res.error);
    }
    setPromoOk({ code: res.code, discount: res.discount });
    setPromo(res.code);
  }

  function confirm() {
    if (pending) return;
    if (method === "cash" && (tenderedNum == null || tenderedNum < due)) {
      setError("المبلغ المدفوع أقل من الإجمالي");
      return;
    }
    setError(null);

    const items = lines.map((l) => ({
      product_id: l.product_id,
      crop_material_id: l.crop_material_id,
      qty: l.qty,
      options: l.options.map((o) => o.id),
    }));
    // لحظة البيع تُلتقط **الآن**، لا حين يُرفع: هي ما يحدّد اليوم المحاسبي
    // ووردية الدرج، ولو أُخذت وقت الرفع لانتقل بيع الليل إلى صباح الغد.
    const at = new Date().toISOString();

    /** يحفظ البيع محلياً ويُظهر إيصالاً صريحاً بأنه لم يُرفع بعد. */
    function keepLocally(reason: string) {
      const row = enqueue({
        idempotencyKey: idemKey,
        occurredAt: at,
        shiftId,
        items,
        fulfillment,
        method,
        tendered: method === "cash" ? tenderedNum : null,
        total,
        customerId: customerId ?? null,
      });
      if (!row) {
        // ذاكرة الجهاز رفضت الحفظ. لا نُظهر إيصالاً لبيعٍ لم يُحفظ —
        // إيصالٌ بلا سجلّ أسوأ من بيعٍ لم يتمّ.
        setError("تعذّر حفظ البيع في الجهاز. لا تسلّم الطلب، وأعد المحاولة.");
        return;
      }
      setReceipt({
        orderNumber: row.localRef, total: due, change: method === "cash" && tenderedNum != null ? tenderedNum - due : null,
        method, fulfillment, currency, shopName: "مقهى خزف", shopPhone: "", lines, at,
        pendingUpload: true, pendingReason: reason,
      });
    }

    start(async () => {
      // الشبكة غائبة أصلاً: لا نُضيّع ثانيةً في محاولة تفشل
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        keepLocally("بلا إنترنت");
        return;
      }
      let res;
      try {
        res = await pay({
          items,
          fulfillment,
          method,
          tendered: method === "cash" ? tenderedNum : null,
          idempotencyKey: idemKey,
          customerId: customerId ?? null,
          promoCode: promoOk?.code ?? null,
          // **لا نُمرّر `occurredAt` ونحن متّصلون.** لحظة البيع هي الآن،
          // والخادم يعرفها. وتمريرها هنا كان يختم `synced_at` على كل
          // فاتورة، فتقرأ الإدارة «٥ فواتير بيعت بلا إنترنت» في يومٍ لم
          // ينقطع فيه النت أصلاً — ومؤشّرٌ يصرخ دائماً لا يُقرأ أبداً.
          // الطابور وحده يُمرّرها، لأن بيعه **تأخّر** فعلاً.
          shiftId,
        });
      } catch {
        // سقطت الشبكة أثناء الإرسال. قد يكون الخادم استلمها وقد لا — والمفتاح
        // الفريد يحسم ذلك عند الرفع: إن كانت وصلت رُدَّت الأولى بلا تكرار.
        keepLocally("انقطع الاتصال أثناء الإرسال");
        return;
      }
      if (res.ok) {
        setReceipt({
          orderNumber: res.orderNumber, total: res.total, change: res.change, method, fulfillment,
          currency, shopName: "مقهى خزف", shopPhone: "", lines, at,
        });
      } else {
        setError(res.error);
      }
    });
  }

  if (receipt) {
    return (
      <Modal
        title={receipt.pendingUpload ? `طلب محلّي #${receipt.orderNumber}` : `تم الطلب #${receipt.orderNumber}`}
        onClose={onPaid}
      >
        {receipt.pendingUpload && (
          <div className="mb-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">محفوظ في الجهاز — لم يُرفع بعد</span>
            <span className="mt-0.5 block text-xs">
              {receipt.pendingReason}. الرقم أعلاه محلّي مؤقّت، ورقم الفاتورة
              الحقيقي يُعطى عند الرفع. سلّم الطلب واقبض عادةً — البيع مسجَّل.
            </span>
          </div>
        )}
        <div className="mb-4 rounded-2xl bg-accent/10 p-4 text-center">
          <div className="text-sm text-accentdeep">
            {receipt.pendingUpload ? "تم استلام المبلغ" : "تم الدفع بنجاح"}
          </div>
          {receipt.method === "cash" && receipt.change != null && (
            <div className="nums mt-1 font-display text-2xl font-bold text-accentdeep">
              الباقي {money(receipt.change, currency)}
            </div>
          )}
        </div>
        <div className="max-h-[40vh] overflow-y-auto rounded-2xl border border-line bg-cream p-2">
          <Receipt info={receipt} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button onClick={() => window.print()} className="btn-ghost">طباعة</button>
          <button onClick={onPaid} className="btn-primary py-3">طلب جديد</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="الدفع" onClose={onClose}>
      <div className="mb-3 rounded-2xl bg-dark/5 px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-muted">المطلوب</span>
          <span className="nums font-display text-3xl font-bold text-ink">
            {money(due, currency)}
          </span>
        </div>
        {/* الأصل والخصم مذكوران: الباريستا يقول للزبون كم حُسم */}
        {promoOk && (
          <div className="mt-2 flex items-baseline justify-between border-t border-line/60 pt-2 text-xs">
            <span className="text-muted">
              قبل الخصم <span dir="ltr" className="nums line-through">{money(total, currency)}</span>
            </span>
            <span className="nums font-semibold text-emerald-700">
              −{money(promoOk.discount, currency)} · {promoOk.code}
            </span>
          </div>
        )}
      </div>

      {/* كود الخصم */}
      <div className="mb-5">
        {promoOk ? (
          <button
            onClick={() => {
              setPromoOk(null);
              setPromo("");
              setPromoErr(null);
            }}
            className="tap w-full rounded-xl border border-line bg-sand px-3 py-2 text-xs text-muted"
          >
            أزل الكود
          </button>
        ) : (
          <>
            <div className="flex gap-2">
              <input
                dir="ltr"
                className="field flex-1 text-center font-mono text-sm tracking-widest"
                placeholder="كود خصم (اختياري)"
                maxLength={20}
                value={promo}
                onChange={(e) => {
                  setPromo(e.target.value.toUpperCase());
                  setPromoErr(null);
                }}
              />
              <button
                type="button"
                onClick={applyPromo}
                disabled={promoBusy || promo.trim().length === 0}
                className="btn-ghost shrink-0 px-4 py-3 text-sm disabled:opacity-40"
              >
                {promoBusy ? "..." : "طبّق"}
              </button>
            </div>
            {promoErr && (
              <p className="mt-1.5 text-center text-xs font-medium text-red-600">{promoErr}</p>
            )}
          </>
        )}
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-dark/5 p-1">
        <MSeg active={method === "cash"} onClick={() => setMethod("cash")}>كاش</MSeg>
        <MSeg active={method === "card"} onClick={() => setMethod("card")}>بطاقة</MSeg>
      </div>

      {method === "cash" ? (
        <>
          {/* لوحة أرقام لا حقل كتابة: لوحة مفاتيح النظام تغطّي نصف الشاشة
              وتُبطئ أكثر ما يُكرَّر في اليوم. والأزرار الجاهزة تكفي غالباً. */}
          <div
            className="mb-2 flex h-14 items-center justify-between rounded-2xl border border-line bg-cream px-4"
            dir="ltr"
          >
            <span className="nums font-display text-2xl font-bold text-ink">
              {tendered === "" ? "0" : Number(tendered).toLocaleString("en-US")}
            </span>
            <span className="text-xs text-muted" dir="rtl">المدفوع</span>
          </div>

          <div className="mb-2 grid grid-cols-4 gap-1.5 nums">
            {quick.map((q) => (
              <button
                key={q}
                onClick={() => { setTendered(String(q)); setError(null); }}
                className="tap rounded-xl border border-line bg-cream py-2.5 text-xs font-semibold text-ink active:bg-sand"
              >
                {money(q, "")}
              </button>
            ))}
          </div>

          <div className="mb-4 grid grid-cols-3 gap-1.5">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "000", "0"].map((k) => (
              <Key key={k} onClick={() => { setTendered((t) => (t === "0" ? k : t + k)); setError(null); }}>
                {k}
              </Key>
            ))}
            <Key onClick={() => { setTendered((t) => t.slice(0, -1)); setError(null); }} label="مسح رقم">
              ⌫
            </Key>
          </div>

          {change != null && change >= 0 && (
            <div className="mb-4 flex items-center justify-between rounded-2xl bg-accent/10 px-4 py-3 text-accentdeep">
              <span className="text-sm">الباقي</span>
              <span className="nums font-display text-xl font-bold">{money(change, currency)}</span>
            </div>
          )}
        </>
      ) : (
        <p className="mb-4 rounded-2xl bg-dark/5 p-4 text-center text-sm text-muted">مرّر البطاقة على جهاز البنك، ثم أكّد.</p>
      )}

      {error && <div className="mb-4 text-center text-sm text-red-600">{error}</div>}

      <button onClick={confirm} disabled={pending} className="btn-primary w-full py-4 text-lg">
        {pending ? "..." : "تأكيد الدفع"}
      </button>
    </Modal>
  );
}

function MSeg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`tap rounded-lg py-3 text-sm font-semibold ${active ? "bg-cream text-ink shadow-soft" : "text-muted"}`}
    >
      {children}
    </button>
  );
}

/** مفتاح لوحة الأرقام — ٥٦ بكسل، يُضغط بإبهام مبلول بالحليب. */
function Key({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="tap flex h-14 items-center justify-center rounded-xl border border-line bg-cream font-display text-xl font-bold text-ink active:bg-sand"
    >
      {children}
    </button>
  );
}
