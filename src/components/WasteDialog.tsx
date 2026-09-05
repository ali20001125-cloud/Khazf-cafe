"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { WASTE_REASONS, inputUnit, toBase } from "@/lib/labels";
import { listWasteMaterials, wasteAction, type WasteMaterial } from "@/app/pos/waste-actions";

export default function WasteDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [materials, setMaterials] = useState<WasteMaterial[] | null>(null);
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
        <p className="py-6 text-center text-sm text-neutral-400">...</p>
      ) : (
        <>
          <label className="mb-1 block text-sm text-neutral-600">المادة</label>
          <select
            value={materialId}
            onChange={(e) => {
              setMaterialId(e.target.value);
              setError(null);
            }}
            className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2"
          >
            <option value="">اختر…</option>
            {materials?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>

          <label className="mb-1 block text-sm text-neutral-600">
            الكمية {unit ? `(${unit.label})` : ""}
          </label>
          <input
            type="number"
            inputMode="decimal"
            value={qty}
            onChange={(e) => {
              setQty(e.target.value);
              setError(null);
            }}
            className="mb-3 w-full rounded-lg border border-neutral-200 px-3 py-2 text-center"
            dir="ltr"
          />

          <label className="mb-1 block text-sm text-neutral-600">السبب</label>
          <div className="mb-3 grid grid-cols-3 gap-2">
            {WASTE_REASONS.map((r) => (
              <button
                key={r.value}
                onClick={() => {
                  setReason(r.value);
                  setError(null);
                }}
                className={`rounded-lg py-2 text-xs ${
                  reason === r.value ? "bg-[#8a6a4f] text-white" : "border border-neutral-200 bg-white text-neutral-600"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>

          {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}

          <button
            onClick={confirm}
            disabled={pending}
            className="w-full rounded-xl bg-[#8a6a4f] py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {pending ? "..." : "تسجيل الهدر"}
          </button>
        </>
      )}
    </Modal>
  );
}
