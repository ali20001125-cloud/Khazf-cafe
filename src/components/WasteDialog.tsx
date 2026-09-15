"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { inputUnit, toBase } from "@/lib/labels";
import {
  listWasteMaterials, listWasteReasons, wasteAction, type WasteMaterial,
} from "@/app/pos/waste-actions";

export default function WasteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [materials, setMaterials] = useState<WasteMaterial[] | null>(null);
  // الأسباب من القاعدة لا من قائمة ثابتة في الكود: المالك يعدّلها بكلامه
  const [reasons, setReasons] = useState<{ key: string; label: string }[]>([]);
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    listWasteMaterials().then((res) => {
      if (Array.isArray(res)) setMaterials(res);
      else setError(res.error);
    });
    listWasteReasons().then((res) => {
      if (Array.isArray(res)) setReasons(res);
    });
  }, []);

  const material = materials?.find((m) => m.id === materialId);
  const unit = material ? inputUnit(material.base_unit) : null;

  function confirm() {
    if (pending) return;
    if (!materialId) return setError("اختر المادة");
    if (!reason) return setError("اختر السبب");
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) return setError("أدخل الكمية");
    setError(null);
    start(async () => {
      const res = await wasteAction(materialId, toBase(n, material!.base_unit), reason);
      if (res.ok) {
        onClose();
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Modal title="تسجيل هدر" onClose={onClose}>
      {materials === null && !error ? (
        <p className="py-6 text-center text-sm text-muted">...</p>
      ) : (
        <>
          <label className="mb-1 block text-sm text-muted">المادة</label>
          <select
            value={materialId}
            onChange={(e) => {
              setMaterialId(e.target.value);
              setError(null);
            }}
            className="mb-3 w-full rounded-lg border border-line px-3 py-2"
          >
            <option value="">اختر…</option>
            {materials?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-sm text-muted">
            الكمية {unit ? `(${unit.label})` : ""}
          </label>
          {material && (
            <p className="mb-1 text-[11px] text-muted">
              اكتبها بالـ{unit?.label} — جرعة الإسبريسو ١٨، وكوب الحليب ٢٠٠.
            </p>
          )}
          <input
            type="number"
            inputMode="numeric"
            step="1"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setError(null);
            }}
            className="mb-3 w-full rounded-lg border border-line px-3 py-2 text-center"
            dir="ltr"
          />

          <label className="mb-1 block text-sm text-muted">السبب</label>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {reasons.map((r) => (
              <button
                key={r.key}
                onClick={() => {
                  setReason(r.key);
                  setError(null);
                }}
                className={`tap min-h-[2.75rem] rounded-xl px-2 py-2 text-sm ${
                  reason === r.key
                    ? "bg-accent font-semibold text-cream"
                    : "border border-line bg-cream text-muted"
                }`}
              >
                {r.label}
              </button>
            ))}
            {reasons.length === 0 && (
              <p className="col-span-2 py-3 text-center text-xs text-muted">
                لا أسباب معرّفة — يضيفها المالك من المخزون.
              </p>
            )}
          </div>

          {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}

          <button
            onClick={confirm}
            disabled={pending}
            className="w-full rounded-xl bg-accent py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {pending ? "..." : "تسجيل الهدر"}
          </button>
        </>
      )}
    </Modal>
  );
}
