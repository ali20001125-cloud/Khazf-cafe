"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { money, stockLabel, baseQtyLabel } from "@/lib/format";
import { inputUnit, costUnit, toBase, costToBase } from "@/lib/labels";
import { addStockAction, addStockByUnitAction, stockCountAction } from "@/app/manage/actions";
import type { CountResult } from "@/lib/inventory";

type M = { id: string; name: string; base_unit: "g" | "ml" | "pcs"; stock: number };

/**
 * إضافة مخزون وجرد.
 *
 * **الإضافة تراكمية**: الرقم الذي تُدخله يُضاف لما في المخزون، لا يستبدله.
 * وهذا مكتوب في الشاشة صراحةً لأن الخلط بينهما يفسد الرصيد بلا أن ينتبه أحد.
 */
export default function InventoryActions({
  materials,
  units = [],
  reasons = [],
  currency,
}: {
  materials: M[];
  currency: string;
  /** وحدات الشراء — الشراء بها بدل الوحدة الأساس (هجرة 0028). */
  units?: { id: string; material_id: string; name: string; base_qty: number; is_default: boolean }[];
  reasons?: { key: string; label: string }[];
}) {
  const [mode, setMode] = useState<null | "add" | "count">(null);

  return (
    <div className="flex gap-2">
      <button onClick={() => setMode("add")} className="btn-primary px-4 py-2 text-sm">
        إضافة مخزون
      </button>
      <button onClick={() => setMode("count")} className="btn-ghost px-4 py-2 text-sm">
        جرد
      </button>

      {mode === "add" && (
        <AddStock materials={materials} currency={currency} units={units} onClose={() => setMode(null)} />
      )}
      {mode === "count" && <StockCount materials={materials} onClose={() => setMode(null)} />}
    </div>
  );
}

function AddStock({
  materials,
  currency,
  units,
  onClose,
}: {
  materials: M[];
  currency: string;
  units: { id: string; material_id: string; name: string; base_qty: number; is_default: boolean }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  // وحدة الشراء المختارة — فارغةٌ تعني الوحدة الأساس كما كان
  const [unitId, setUnitId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; added: string; now: string } | null>(null);
  const [pending, start] = useTransition();

  const m = materials.find((x) => x.id === id);
  const u = m ? inputUnit(m.base_unit) : null;
  const cu = m ? costUnit(m.base_unit) : null;
  const myUnits = units.filter((x) => x.material_id === id);
  const unit = myUnits.find((x) => x.id === unitId) ?? null;
  const qtyNum = Number(qty);
  // بوحدة الشراء: الكمية × ما فيها. وبلا وحدة: التحويل القديم (كغ ← غ).
  const addedBase =
    m && Number.isFinite(qtyNum) && qtyNum > 0
      ? unit
        ? Math.round(qtyNum * unit.base_qty)
        : toBase(qtyNum, m.base_unit)
      : null;
  const preview = m && addedBase != null ? m.stock + addedBase : null;

  function submit() {
    if (!m || !u) return setError("اختر المادة");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("أدخل الكمية");
    const c = Number(cost);
    if (cost !== "" && (!Number.isFinite(c) || c < 0)) return setError("تكلفة غير صالحة");
    setError(null);
    start(async () => {
      // بوحدة شراء: القاعدة تحوّل الكمية والتكلفة وتحفظ الوحدة مع الصفّ.
      if (unit) {
        const r = await addStockByUnitAction(m.id, unit.id, qtyNum, cost === "" ? 0 : c, "شراء");
        if (!("ok" in r) || !r.ok) return setError("error" in r ? r.error : "تعذّرت الإضافة");
        setDone({
          name: m.name,
          added: `${qtyNum} ${unit.name}`,
          now: stockLabel(m.stock + Math.round(qtyNum * unit.base_qty), m.base_unit),
        });
        router.refresh();
        return;
      }
      const r = await addStockAction(
        m.id,
        toBase(qtyNum, m.base_unit),
        cost === "" ? 0 : costToBase(c, m.base_unit),
        "شراء"
      );
      if (!("ok" in r) || !r.ok) return setError("error" in r ? r.error : "تعذّرت الإضافة");
      setDone({
        name: m.name,
        added: `${qtyNum} ${u.label}`,
        now: stockLabel(r.newStock, m.base_unit),
      });
      router.refresh();
    });
  }

  if (done) {
    return (
      <Modal title="أُضيف للمخزون" onClose={onClose}>
        <div className="rounded-2xl bg-emerald-50 p-4 text-center">
          <p className="font-display font-bold text-emerald-900">{done.name}</p>
          <p className="nums mt-1 text-sm text-emerald-800">أُضيف {done.added}</p>
          <p className="nums mt-3 font-display text-2xl font-bold text-emerald-900">
            الرصيد الآن {done.now}
          </p>
        </div>
        <button onClick={onClose} className="btn-primary mt-4 w-full py-3">
          تم
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="إضافة مخزون" onClose={onClose}>
      <p className="mb-4 rounded-xl bg-sand p-3 text-xs text-muted">
        الكمية <span className="font-semibold text-ink">تُضاف</span> إلى الموجود ولا تستبدله.
        لو كان عندك ٣٥٠٠ غ وأضفت ١٠٠٠ غ يصير الرصيد ٤٥٠٠ غ. اكتب بالغرام —
        ٥ كيلو تعني ٥٠٠٠.
      </p>

      <label className="mb-1.5 block text-sm font-semibold text-ink">المادة</label>
      <select className="field mb-4" value={id} onChange={(e) => { setId(e.target.value); setError(null); }}>
        <option value="">— اختر —</option>
        {materials.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name} (الآن {stockLabel(x.stock, x.base_unit)})
          </option>
        ))}
      </select>

      {m && myUnits.length > 0 && (
        <>
          <label className="mb-1.5 block text-sm font-semibold text-ink">وحدة الشراء</label>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {myUnits.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => { setUnitId(x.id); setError(null); }}
                className={`tap rounded-xl border px-3 py-2 text-sm ${
                  unitId === x.id ? "border-accent bg-accent/10 text-ink" : "border-line bg-cream text-muted"
                }`}
              >
                {x.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { setUnitId(""); setError(null); }}
              className={`tap rounded-xl border px-3 py-2 text-sm ${
                unitId === "" ? "border-accent bg-accent/10 text-ink" : "border-line bg-cream text-muted"
              }`}
            >
              بالـ{u?.label}
            </button>
          </div>
        </>
      )}

      {m && u && (
        <>
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            الكمية المُضافة ({unit ? unit.name : u.label})
          </label>
          <input
            type="number"
            inputMode="numeric"
            step={unit ? "any" : "1"}
            dir="ltr"
            className="field nums mb-1 text-center text-lg"
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(null); }}
          />
          {preview != null && (
            <p className="nums mb-4 text-center text-sm text-accentdeep">
              {baseQtyLabel(m.stock, m.base_unit)} + {qty} {unit ? unit.name : u.label}
              {unit && ` (${baseQtyLabel(addedBase ?? 0, m.base_unit)})`} ={" "}
              <span className="font-bold">{baseQtyLabel(preview, m.base_unit)}</span>
            </p>
          )}

          <label className="mb-1.5 block text-sm font-semibold text-ink">
            التكلفة لكل {unit ? unit.name : cu?.label}{" "}
            <span className="font-normal text-muted">(اختياري)</span>
          </label>
          <input
            type="number"
            inputMode="decimal"
            dir="ltr"
            className="field nums mb-1 text-center"
            value={cost}
            onChange={(e) => { setCost(e.target.value); setError(null); }}
          />
          <p className="mb-4 text-xs text-muted">
            تُحدِّث متوسّط تكلفة المادة — يفيد في معرفة قيمة مخزونك.
          </p>
        </>
      )}

      {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
      <button onClick={submit} disabled={pending || !m} className="btn-primary w-full">
        {pending ? "…" : "إضافة"}
      </button>
    </Modal>
  );
}

function StockCount({ materials, onClose }: { materials: M[]; onClose: () => void }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CountResult | null>(null);
  const [asking, setAsking] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, start] = useTransition();

  /**
   * الجرد يسوّي الرصيد على ما يُكتَب، فخطأُ إدخالٍ واحد يفسد المخزون كلّه:
   * كُتب `50` بدل `5000` فصار الرصيد ٥٠٬٠٠٠ غ، وقَبِلها النظام بصمت.
   * فرقٌ يفوق النصف ليس عدّاً — هو رقمٌ غلط أو مفاجأةٌ تستحقّ وقفة.
   */
  const suspicious = materials
    .filter((m) => counts[m.id] !== undefined && counts[m.id] !== "")
    .map((m) => ({ m, counted: toBase(Number(counts[m.id]), m.base_unit) }))
    .filter(({ m, counted }) => {
      if (!Number.isFinite(counted) || counted < 0) return false;
      const gap = Math.abs(counted - m.stock);
      return gap > Math.max(m.stock * 0.5, 500);
    });

  function submit() {
    const items = materials
      .filter((m) => counts[m.id] !== undefined && counts[m.id] !== "")
      .map((m) => ({ material_id: m.id, counted: toBase(Number(counts[m.id]), m.base_unit) }));
    if (items.length === 0) return setError("أدخل الكمية المعدودة لمادة واحدة على الأقل");
    if (items.some((i) => !Number.isFinite(i.counted) || i.counted < 0))
      return setError("كمية غير صالحة");
    if (suspicious.length > 0 && !confirmed) {
      setError(null);
      return setAsking(true);
    }
    setError(null);
    start(async () => {
      const r = await stockCountAction(items);
      if (!("ok" in r) || !r.ok) return setError("error" in r ? r.error : "تعذّر الجرد");
      setResult(r.result);
      router.refresh();
    });
  }

  if (asking) {
    return (
      <Modal title="تأكيد قبل التسجيل" onClose={() => setAsking(false)}>
        <p className="mb-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          رقمٌ بعيدٌ جداً عن المتوقّع. الجرد يسوّي الرصيد على ما تكتبه، فراجعه
          قبل التسجيل — واحفظ أن الكمية <span className="font-semibold">بالغرام</span>،
          فـ«٥ كيلو» تُكتب ٥٠٠٠ لا ٥.
        </p>
        <ul className="divide-y divide-line">
          {suspicious.map(({ m, counted }) => (
            <li key={m.id} className="py-2 text-sm">
              <span className="font-semibold text-ink">{m.name}</span>
              <span className="nums mt-0.5 block text-xs text-muted">
                المتوقّع {baseQtyLabel(m.stock, m.base_unit)} · كتبتَ{" "}
                <span className="font-semibold text-amber-700">
                  {baseQtyLabel(counted, m.base_unit)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex gap-2">
          <button onClick={() => setAsking(false)} className="btn-primary flex-1 py-3">
            أرجع وأصحّح
          </button>
          <button
            onClick={() => {
              setConfirmed(true);
              setAsking(false);
              start(async () => {
                const items = materials
                  .filter((m) => counts[m.id] !== undefined && counts[m.id] !== "")
                  .map((m) => ({
                    material_id: m.id,
                    counted: toBase(Number(counts[m.id]), m.base_unit),
                  }));
                const r = await stockCountAction(items);
                if (!("ok" in r) || !r.ok)
                  return setError("error" in r ? r.error : "تعذّر الجرد");
                setResult(r.result);
                router.refresh();
              });
            }}
            className="btn-ghost flex-1 py-3 text-sm"
          >
            الرقم صحيح، سجّله
          </button>
        </div>
      </Modal>
    );
  }

  if (result) {
    const flagged = result.items.filter((i) => i.variance !== 0);
    return (
      <Modal title="نتيجة الجرد" onClose={onClose}>
        {flagged.length === 0 ? (
          <div className="rounded-2xl bg-emerald-50 p-4 text-center text-emerald-900">
            كل المواد مطابقة ✅
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-muted">
              الفرق سُجّل كما هو وسُوّي الرصيد على المعدود. الفرق ليس هدراً — هو فرق
              غير مُفسَّر حتى تعرف سببه.
            </p>
            <ul className="divide-y divide-line">
              {flagged.map((i) => (
                <li key={i.material_id} className="flex justify-between py-2 text-sm">
                  <span className="text-ink">{i.name}</span>
                  <span className={`nums ${i.variance < 0 ? "text-red-600" : "text-amber-600"}`}>
                    {i.variance > 0 ? "+" : ""}
                    {i.variance} ({i.variance_pct ?? 0}%)
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
        <button onClick={onClose} className="btn-primary mt-4 w-full py-3">
          تم
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="جرد المخزون" onClose={onClose}>
      <p className="mb-4 rounded-xl bg-sand p-3 text-xs text-muted">
        اعدد الموجود فعلاً واكتبه <span className="font-semibold text-ink">بالغرام</span>
        (٥ كيلو = ٥٠٠٠). النظام يقارنه بالمتوقّع ويسجّل الفرق ثم يسوّي الرصيد.
        اترك المادة فارغة إن لم تعدّها.
      </p>

      <div className="max-h-[45vh] space-y-3 overflow-y-auto">
        {materials.map((m) => {
          const u = inputUnit(m.base_unit);
          return (
            <div key={m.id} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-ink">
                {m.name}
                <span className="nums block text-[11px] text-muted">
                  المتوقّع {baseQtyLabel(m.stock, m.base_unit)}
                </span>
              </span>
              <input
                type="number"
                inputMode="numeric"
                step="1"
                dir="ltr"
                placeholder="المعدود"
                className="field nums w-28 text-center"
                value={counts[m.id] ?? ""}
                onChange={(e) => {
                  setCounts((c) => ({ ...c, [m.id]: e.target.value }));
                  setError(null);
                }}
              />
              <span className="w-8 text-xs text-muted">{u.label}</span>
            </div>
          );
        })}
      </div>

      {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
      <button onClick={submit} disabled={pending} className="btn-primary mt-4 w-full">
        {pending ? "…" : "تسجيل الجرد"}
      </button>
    </Modal>
  );
}
