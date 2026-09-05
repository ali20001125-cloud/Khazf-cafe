"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import type { CatalogProduct } from "@/lib/catalog";
import { recordStaffDrinkAction } from "@/app/pos/staff-actions";

export default function StaffDrinkDialog({ catalog, onClose }: { catalog: CatalogProduct[]; onClose: () => void }) {
  const router = useRouter();
  const [product, setProduct] = useState<CatalogProduct | null>(null);
  const [cropId, setCropId] = useState<string | null>(null);
  const [fulfillment, setFulfillment] = useState<"takeaway" | "dine_in">("takeaway");
  const [needPin, setNeedPin] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function chooseProduct(p: CatalogProduct) {
    const avail = p.crops.filter((c) => c.available);
    if (avail.length === 0) return;
    setProduct(p);
    setCropId(avail.length === 1 ? avail[0].material_id : null);
    setError(null);
  }

  function confirm(approvalPin?: string) {
    if (pending || !product || !cropId) return;
    setError(null);
    start(async () => {
      const res = await recordStaffDrinkAction(product.id, cropId, fulfillment, approvalPin);
      if (res.ok) { onClose(); router.refresh(); return; }
      if ("needsApproval" in res && res.needsApproval) { setNeedPin(true); return; }
      setError(res.error);
    });
  }

  // شاشة موافقة المالك (تجاوز الحدّ)
  if (needPin) {
    return (
      <Modal title="تجاوز حدّ مشروب الموظف" onClose={onClose}>
        <p className="mb-3 text-sm text-muted">استهلكت حدّك لهذه الوردية. يحتاج موافقة المالك.</p>
        <input
          type="password" inputMode="numeric" value={pin}
          onChange={(e) => { setPin(e.target.value); setError(null); }}
          placeholder="رمز المالك" className="field nums mb-3 text-center text-lg" dir="ltr"
        />
        {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
        <button onClick={() => confirm(pin)} disabled={pending} className="btn-primary w-full">
          {pending ? "..." : "موافقة وتسجيل"}
        </button>
      </Modal>
    );
  }

  // اختيار المشروب/المحصول + التأكيد
  return (
    <Modal title="مشروب موظف" onClose={onClose}>
      {!product ? (
        <div className="grid grid-cols-3 gap-2">
          {catalog.map((p) => {
            const avail = p.crops.filter((c) => c.available);
            return (
              <button key={p.id} onClick={() => chooseProduct(p)} disabled={p.paused || avail.length === 0}
                className="tap rounded-xl border border-line bg-cream p-2 text-center text-sm font-medium text-ink disabled:opacity-40">
                {p.name}
              </button>
            );
          })}
        </div>
      ) : !cropId ? (
        <div className="space-y-2">
          <p className="text-sm text-muted">اختر المحصول لـ{product.name}</p>
          {product.crops.filter((c) => c.available).map((c) => (
            <button key={c.material_id} onClick={() => setCropId(c.material_id)}
              className="tap w-full rounded-xl border border-line bg-cream px-4 py-3 text-right font-medium text-ink">
              {c.crop_name}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-2xl bg-dark/5 p-4 text-center">
            <div className="font-display text-lg font-bold text-ink">{product.name}</div>
            <div className="text-xs text-muted">
              {product.crops.find((c) => c.material_id === cropId)?.crop_name} · مجاني
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl bg-dark/5 p-1">
            <button onClick={() => setFulfillment("takeaway")} className={`tap rounded-lg py-2 text-sm ${fulfillment === "takeaway" ? "bg-cream text-ink shadow-soft" : "text-muted"}`}>سفري</button>
            <button onClick={() => setFulfillment("dine_in")} className={`tap rounded-lg py-2 text-sm ${fulfillment === "dine_in" ? "bg-cream text-ink shadow-soft" : "text-muted"}`}>جلوس</button>
          </div>
          {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { setProduct(null); setCropId(null); }} className="btn-ghost">رجوع</button>
            <button onClick={() => confirm()} disabled={pending} className="btn-primary py-3">{pending ? "..." : "تسجيل"}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
