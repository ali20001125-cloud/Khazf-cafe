"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money, stockLabel } from "@/lib/format";
import { inputUnit, toBase, costToBase } from "@/lib/labels";
import Modal from "@/components/Modal";
import { addStockAction, stockCountAction } from "@/app/manage/actions";
import type { CountResult } from "@/lib/inventory";

type M = {
  id: string;
  name: string;
  base_unit: "g" | "ml" | "pcs";
  cached_stock: number;
  low_threshold: number;
  current_cost: number;
};

// عتبات الفرق% (المواصفة): أخضر ≤3 · أصفر ≤5 · أحمر >5
function varianceColor(pct: number | null): string {
  const a = Math.abs(pct ?? 0);
  if (a <= 3) return "text-emerald-600";
  if (a <= 5) return "text-amber-600";
  return "text-red-600 font-semibold";
}

export default function InventoryManager({ materials, currency }: { materials: M[]; currency: string }) {
  const [mode, setMode] = useState<null | "add" | "count">(null);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setMode("add")} className="rounded-lg bg-[#8a6a4f] px-4 py-2 text-sm font-medium text-white">
          إضافة مخزون
        </button>
        <button onClick={() => setMode("count")} className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-[#5b4636]">
          جرد المخزون
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-neutral-500">
            <tr>
              <th className="px-3 py-2 text-right font-medium">المادة</th>
              <th className="px-3 py-2 text-right font-medium">الرصيد</th>
              <th className="px-3 py-2 text-right font-medium">التكلفة</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const u = inputUnit(m.base_unit);
              const low = m.cached_stock <= m.low_threshold;
              return (
                <tr key={m.id} className="border-t border-neutral-100">
                  <td className="px-3 py-2 text-[#5b4636]">{m.name}</td>
                  <td className={`px-3 py-2 ${low ? "text-amber-700" : "text-neutral-600"}`}>
                    {stockLabel(m.cached_stock, m.base_unit)}
                    {low && <span className="mr-1 text-[10px]">· منخفض</span>}
                  </td>
                  <td className="px-3 py-2 text-neutral-500">
                    {money(m.current_cost * u.factor, currency)}/{u.label}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mode === "add" && <AddStockDialog materials={materials} currency={currency} onClose={() => setMode(null)} />}
      {mode === "count" && <CountDialog materials={materials} onClose={() => setMode(null)} />}
    </div>
  );
}

function AddStockDialog({ materials, currency, onClose }: { materials: M[]; currency: string; onClose: () => void }) {
  const router = useRouter();
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const material = materials.find((m) => m.id === materialId);
  const u = material ? inputUnit(material.base_unit) : null;

  function confirm() {
    if (pending) return;
    if (!materialId) return setError("اختر المادة");
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) return setError("أدخل الكمية");
    const c = cost === "" ? 0 : Number(cost);
    if (!Number.isFinite(c) || c < 0) return setError("تكلفة غير صالحة");
    setError(null);
    start(async () => {
      const res = await addStockAction(
        materialId,
        toBase(q, material!.base_unit),
        costToBase(c, material!.base_unit),
        "شراء"
      );
      if ("ok" in res && res.ok) {
        onClose();
        router.refresh();
      } else {
        setError((res as { error: string }).error);
      }
    });
  }

  return (
    <Modal title="إضافة مخزون" onClose={onClose}>
      <label className="mb-1 block text-sm text-neutral-600">المادة</label>
      <select value={materialId} onChange={(e) => { setMaterialId(e.target.value); setError(null); }} className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2">
        <option value="">اختر…</option>
        {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>

      <label className="mb-1 block text-sm text-neutral-600">الكمية {u ? `(${u.label})` : ""}</label>
      <input type="number" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setError(null); }} className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-center" dir="ltr" />

      <label className="mb-1 block text-sm text-neutral-600">التكلفة لكل {u ? u.label : "وحدة"} (اختياري)</label>
      <input type="number" inputMode="numeric" value={cost} onChange={(e) => { setCost(e.target.value); setError(null); }} placeholder={`${currency} / ${u ? u.label : ""}`} className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-center" dir="ltr" />

      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
      <button onClick={confirm} disabled={pending} className="w-full rounded-xl bg-[#8a6a4f] py-3 text-base font-semibold text-white disabled:opacity-50">
        {pending ? "..." : "إضافة"}
      </button>
    </Modal>
  );
}

function CountDialog({ materials, onClose }: { materials: M[]; onClose: () => void }) {
  const router = useRouter();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [result, setResult] = useState<CountResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function confirm() {
    if (pending) return;
    const entries = Object.entries(counts).filter(([, v]) => v !== "");
    if (entries.length === 0) return setError("أدخل العدّ لمادة واحدة على الأقل");
    const payload = entries.map(([id, v]) => {
      const m = materials.find((x) => x.id === id)!;
      return { material_id: id, counted: toBase(Number(v), m.base_unit) };
    });
    setError(null);
    start(async () => {
      const res = await stockCountAction(payload);
      if ("ok" in res && res.ok) setResult(res.result);
      else setError((res as { error: string }).error);
    });
  }

  if (result) {
    return (
      <Modal title="نتيجة الجرد" onClose={() => { onClose(); router.refresh(); }}>
        <p className="mb-3 text-sm text-neutral-500">الفرق% يكشف الاختلاف بين المعدود والمتوقّع.</p>
        <div className="space-y-2">
          {result.items.map((i) => (
            <div key={i.material_id} className="flex items-center justify-between rounded-lg border border-neutral-100 p-2 text-sm">
              <span className="text-[#5b4636]">{i.name}</span>
              <span className={varianceColor(i.variance_pct)}>
                {i.variance > 0 ? "+" : ""}{i.variance} ({i.variance_pct ?? 0}%)
              </span>
            </div>
          ))}
        </div>
        <button onClick={() => { onClose(); router.refresh(); }} className="mt-4 w-full rounded-xl bg-[#8a6a4f] py-3 text-sm font-semibold text-white">
          تم
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="جرد المخزون (عدّ)" onClose={onClose}>
      <p className="mb-3 text-sm text-neutral-500">أدخل الكمية المعدودة فعلياً. تُترك الفارغة بلا تغيير.</p>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto">
        {materials.map((m) => {
          const u = inputUnit(m.base_unit);
          return (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <span className="text-sm text-[#5b4636]">{m.name}</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={counts[m.id] ?? ""}
                  onChange={(e) => { setCounts((p) => ({ ...p, [m.id]: e.target.value })); setError(null); }}
                  className="w-24 rounded-lg border border-neutral-200 px-2 py-1.5 text-center text-sm"
                  dir="ltr"
                />
                <span className="w-8 text-xs text-neutral-400">{u.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="mt-3 text-center text-sm text-red-600">{error}</div>}
      <button onClick={confirm} disabled={pending} className="mt-4 w-full rounded-xl bg-[#8a6a4f] py-3 text-base font-semibold text-white disabled:opacity-50">
        {pending ? "..." : "احسب الفرق"}
      </button>
    </Modal>
  );
}
