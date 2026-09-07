"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { money, stockLabel } from "@/lib/format";
import { inputUnit, toBase, costToBase } from "@/lib/labels";
import { addStockAction, stockCountAction } from "@/app/manage/actions";
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
  currency,
}: {
  materials: M[];
  currency: string;
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
        <AddStock materials={materials} currency={currency} onClose={() => setMode(null)} />
      )}
      {mode === "count" && <StockCount materials={materials} onClose={() => setMode(null)} />}
    </div>
  );
}

function AddStock({
  materials,
  currency,
  onClose,
}: {
  materials: M[];
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [id, setId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; added: string; now: string } | null>(null);
  const [pending, start] = useTransition();

  const m = materials.find((x) => x.id === id);
  const u = m ? inputUnit(m.base_unit) : null;
  const qtyNum = Number(qty);
  const preview =
    m && u && Number.isFinite(qtyNum) && qtyNum > 0
      ? m.stock + toBase(qtyNum, m.base_unit)
      : null;

  function submit() {
    if (!m || !u) return setError("اختر المادة");
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) return setError("أدخل الكمية");
    const c = Number(cost);
    if (cost !== "" && (!Number.isFinite(c) || c < 0)) return setError("تكلفة غير صالحة");
    setError(null);
    start(async () => {
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
        لو كان عندك ٣٫٥ كغ وأضفت ١ كغ يصير الرصيد ٤٫٥ كغ.
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

      {m && u && (
        <>
          <label className="mb-1.5 block text-sm font-semibold text-ink">
            الكمية المُضافة ({u.label})
          </label>
          <input
            type="number"
            inputMode="decimal"
            dir="ltr"
            className="field nums mb-1 text-center text-lg"
            value={qty}
            onChange={(e) => { setQty(e.target.value); setError(null); }}
          />
          {preview != null && (
            <p className="nums mb-4 text-center text-sm text-accentdeep">
              {stockLabel(m.stock, m.base_unit)} + {qty} {u.label} ={" "}
              <span className="font-bold">{stockLabel(preview, m.base_unit)}</span>
            </p>
          )}

          <label className="mb-1.5 block text-sm font-semibold text-ink">
            التكلفة لكل {u.label} <span className="font-normal text-muted">(اختياري)</span>
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
  const [pending, start] = useTransition();

  function submit() {
    const items = materials
      .filter((m) => counts[m.id] !== undefined && counts[m.id] !== "")
      .map((m) => ({ material_id: m.id, counted: toBase(Number(counts[m.id]), m.base_unit) }));
    if (items.length === 0) return setError("أدخل الكمية المعدودة لمادة واحدة على الأقل");
    setError(null);
    start(async () => {
      const r = await stockCountAction(items);
      if (!("ok" in r) || !r.ok) return setError("error" in r ? r.error : "تعذّر الجرد");
      setResult(r.result);
      router.refresh();
    });
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
        اعدد الموجود فعلاً وأدخله. النظام يقارنه بالمتوقّع ويسجّل الفرق ثم يسوّي
        الرصيد. اترك المادة فارغة إن لم تعدّها.
      </p>

      <div className="max-h-[45vh] space-y-3 overflow-y-auto">
        {materials.map((m) => {
          const u = inputUnit(m.base_unit);
          return (
            <div key={m.id} className="flex items-center gap-3">
              <span className="flex-1 text-sm text-ink">
                {m.name}
                <span className="nums block text-[11px] text-muted">
                  المتوقّع {stockLabel(m.stock, m.base_unit)}
                </span>
              </span>
              <input
                type="number"
                inputMode="decimal"
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
