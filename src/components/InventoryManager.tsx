"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money, stockLabel, timeAr } from "@/lib/format";
import { inputUnit, toBase, costToBase, WASTE_REASONS } from "@/lib/labels";
import Modal from "@/components/Modal";
import { addStockAction, stockCountAction } from "@/app/manage/actions";
import type { CountResult, TxnRow, CountLog } from "@/lib/inventory";

type M = { id: string; name: string; base_unit: "g" | "ml" | "pcs"; cached_stock: number; low_threshold: number; current_cost: number };

function reasonLabel(v: string): string {
  return WASTE_REASONS.find((r) => r.value === v)?.label ?? v;
}
function vColor(pct: number | null): string {
  const a = Math.abs(pct ?? 0);
  if (a <= 3) return "text-emerald-600";
  if (a <= 5) return "text-amber-600";
  return "text-red-600 font-semibold";
}

type Tab = "stock" | "purchases" | "waste" | "counts";

export default function InventoryManager({
  materials, purchases, waste, counts, currency,
}: {
  materials: M[]; purchases: TxnRow[]; waste: TxnRow[]; counts: CountLog[]; currency: string;
}) {
  const [tab, setTab] = useState<Tab>("stock");
  const [mode, setMode] = useState<null | "add" | "count">(null);

  const tabs: { key: Tab; label: string }[] = [
    { key: "stock", label: "الأرصدة" },
    { key: "purchases", label: "المشتريات" },
    { key: "waste", label: "الهدر" },
    { key: "counts", label: "الجرد" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold text-ink">المخزون</h1>
        <div className="flex gap-2">
          <button onClick={() => setMode("add")} className="btn-primary px-4 py-2 text-sm">إضافة مخزون</button>
          <button onClick={() => setMode("count")} className="btn-ghost px-4 py-2 text-sm">جرد</button>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`tap whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium ${tab === t.key ? "bg-dark text-cream" : "border border-line bg-cream text-muted"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "stock" && (
        <div className="overflow-hidden card">
          <table className="w-full text-sm">
            <thead className="bg-sandalt text-muted">
              <tr><Th>المادة</Th><Th>الرصيد</Th><Th>التكلفة</Th></tr>
            </thead>
            <tbody>
              {materials.map((m) => {
                const u = inputUnit(m.base_unit);
                const low = m.cached_stock <= m.low_threshold;
                return (
                  <tr key={m.id} className="border-t border-line">
                    <Td className="text-ink">{m.name}</Td>
                    <Td className={low ? "text-amber-700" : "text-muted"}>
                      <span className="nums">{stockLabel(m.cached_stock, m.base_unit)}</span>{low && <span className="mr-1 text-[10px]">· منخفض</span>}
                    </Td>
                    <Td className="text-muted nums">{money(m.current_cost * u.factor, currency)}/{u.label}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "purchases" && <TxnTable rows={purchases} currency={currency} showCost />}
      {tab === "waste" && <TxnTable rows={waste} currency={currency} isWaste />}

      {tab === "counts" && (
        <div className="overflow-hidden card">
          <table className="w-full text-sm">
            <thead className="bg-sandalt text-muted"><tr><Th>التاريخ</Th><Th>بواسطة</Th><Th>مواد</Th><Th>فروقات</Th></tr></thead>
            <tbody>
              {counts.length === 0 ? <tr><Td className="text-muted" colSpan={4}>لا جرد بعد.</Td></tr> :
                counts.map((c) => (
                  <tr key={c.id} className="border-t border-line">
                    <Td className="nums text-muted">{timeAr(c.created_at)}</Td>
                    <Td className="text-ink">{c.user_name ?? "—"}</Td>
                    <Td className="nums text-muted">{c.items}</Td>
                    <Td className={c.flagged > 0 ? "text-red-600 font-semibold nums" : "text-emerald-600 nums"}>{c.flagged}</Td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {mode === "add" && <AddStockDialog materials={materials} currency={currency} onClose={() => setMode(null)} />}
      {mode === "count" && <CountDialog materials={materials} onClose={() => setMode(null)} />}
    </div>
  );
}

function TxnTable({ rows, currency, showCost, isWaste }: { rows: TxnRow[]; currency: string; showCost?: boolean; isWaste?: boolean }) {
  return (
    <div className="overflow-hidden card">
      <table className="w-full text-sm">
        <thead className="bg-sandalt text-muted">
          <tr><Th>التاريخ</Th><Th>المادة</Th><Th>الكمية</Th>{showCost && <Th>التكلفة</Th>}<Th>{isWaste ? "السبب" : "بواسطة"}</Th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <tr><Td className="text-muted" colSpan={5}>لا سجلّ بعد.</Td></tr> :
            rows.map((r, i) => (
              <tr key={i} className="border-t border-line">
                <Td className="nums text-muted">{timeAr(r.created_at)}</Td>
                <Td className="text-ink">{r.material_name}</Td>
                <Td className="nums text-muted">{r.qty > 0 ? "+" : ""}{r.qty}</Td>
                {showCost && <Td className="nums text-muted">{r.unit_cost != null ? money(r.unit_cost, currency) : "—"}</Td>}
                <Td className="text-muted">{isWaste ? reasonLabel(r.reason) : (r.user_name ?? "—")}</Td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) { return <th className="px-3 py-2 text-right font-medium">{children}</th>; }
function Td({ children, className = "", colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) {
  return <td colSpan={colSpan} className={`px-3 py-2 ${className}`}>{children}</td>;
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
      const res = await addStockAction(materialId, toBase(q, material!.base_unit), costToBase(c, material!.base_unit), "شراء");
      if ("ok" in res && res.ok) { onClose(); router.refresh(); }
      else setError((res as { error: string }).error);
    });
  }

  return (
    <Modal title="إضافة مخزون" onClose={onClose}>
      <label className="mb-1 block text-sm text-muted">المادة</label>
      <select value={materialId} onChange={(e) => { setMaterialId(e.target.value); setError(null); }} className="field mb-3">
        <option value="">اختر…</option>
        {materials.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
      <label className="mb-1 block text-sm text-muted">الكمية {u ? `(${u.label})` : ""}</label>
      <input type="number" inputMode="decimal" value={qty} onChange={(e) => { setQty(e.target.value); setError(null); }} className="field nums mb-3 text-center" dir="ltr" />
      <label className="mb-1 block text-sm text-muted">التكلفة لكل {u ? u.label : "وحدة"} (اختياري)</label>
      <input type="number" inputMode="numeric" value={cost} onChange={(e) => { setCost(e.target.value); setError(null); }} placeholder={`${currency} / ${u ? u.label : ""}`} className="field nums mb-3 text-center" dir="ltr" />
      {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
      <button onClick={confirm} disabled={pending} className="btn-primary w-full">{pending ? "..." : "إضافة"}</button>
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
        <p className="mb-3 text-sm text-muted">الفرق% يكشف الاختلاف بين المعدود والمتوقّع.</p>
        <div className="space-y-2">
          {result.items.map((i) => (
            <div key={i.material_id} className="flex items-center justify-between rounded-lg border border-line p-2 text-sm">
              <span className="text-ink">{i.name}</span>
              <span className={`nums ${vColor(i.variance_pct)}`}>{i.variance > 0 ? "+" : ""}{i.variance} ({i.variance_pct ?? 0}%)</span>
            </div>
          ))}
        </div>
        <button onClick={() => { onClose(); router.refresh(); }} className="btn-primary mt-4 w-full py-3">تم</button>
      </Modal>
    );
  }

  return (
    <Modal title="جرد المخزون (عدّ)" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">أدخل الكمية المعدودة فعلياً. تُترك الفارغة بلا تغيير.</p>
      <div className="max-h-[45vh] space-y-2 overflow-y-auto">
        {materials.map((m) => {
          const u = inputUnit(m.base_unit);
          return (
            <div key={m.id} className="flex items-center justify-between gap-2">
              <span className="text-sm text-ink">{m.name}</span>
              <div className="flex items-center gap-1">
                <input type="number" inputMode="decimal" value={counts[m.id] ?? ""} onChange={(e) => { setCounts((p) => ({ ...p, [m.id]: e.target.value })); setError(null); }} className="field nums w-24 py-1.5 text-center" dir="ltr" />
                <span className="w-8 text-xs text-muted">{u.label}</span>
              </div>
            </div>
          );
        })}
      </div>
      {error && <div className="mt-3 text-center text-sm text-red-600">{error}</div>}
      <button onClick={confirm} disabled={pending} className="btn-primary mt-4 w-full">{pending ? "..." : "احسب الفرق"}</button>
    </Modal>
  );
}
