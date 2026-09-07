"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { money } from "@/lib/format";
import { createProductAction, createCropAction } from "@/app/manage/products-actions";

export type CropOption = { id: string; name: string; stock: number };

/**
 * إضافة مشروب جديد.
 *
 * ثلاثة أسئلة فقط، لأن ما زاد عنها يعطّل صاحب المقهى:
 *   ١. اسمه.
 *   ٢. من أي محصول يُحضَّر، وبكم؟ (محصول واحد أو أكثر، لكل واحد سعره)
 *   ٣. وصفته: كم غراماً من الحبوب، وكم حليباً، وهل يحتاج كوباً سفرياً.
 *
 * الوصفة ليست تفصيلاً ثانوياً: هي ما يخصم المخزون عند كل بيع. مشروب بلا
 * وصفة يُباع بلا أن ينقص شيء، فيبدو المخزون سليماً وهو ينزف.
 */
export default function NewProductDialog({
  crops,
  currency,
  onClose,
}: {
  crops: CropOption[];
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [coffeeGrams, setCoffeeGrams] = useState("18");
  const [milkMl, setMilkMl] = useState("0");
  const [takeawayCup, setTakeawayCup] = useState(true);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // إنشاء محصول جديد من داخل الشاشة
  const [newCrop, setNewCrop] = useState("");
  const [addingCrop, setAddingCrop] = useState(false);

  function toggleCrop(id: string) {
    setPicked((p) => {
      const next = { ...p };
      if (id in next) delete next[id];
      else next[id] = "";
      return next;
    });
    setError(null);
  }

  function addCrop() {
    if (!newCrop.trim()) return;
    setError(null);
    start(async () => {
      const r = await createCropAction(newCrop.trim(), 0);
      if (!r.ok) return setError(r.error);
      setNewCrop("");
      setAddingCrop(false);
      router.refresh();
    });
  }

  function submit() {
    const chosen = Object.entries(picked);
    if (!name.trim()) return setError("اكتب اسم المشروب");
    if (chosen.length === 0) return setError("اختر محصولاً واحداً على الأقل");
    for (const [, price] of chosen) {
      if (price === "" || !(Number(price) >= 0)) return setError("أدخل سعراً لكل محصول مختار");
    }
    setError(null);
    start(async () => {
      const r = await createProductAction({
        name: name.trim(),
        category: "other",
        coffeeGrams: Number(coffeeGrams) || 0,
        milkMl: Number(milkMl) || 0,
        takeawayCup,
        crops: chosen.map(([materialId, price]) => ({ materialId, price: Number(price) })),
      });
      if (!r.ok) return setError(r.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="مشروب جديد" onClose={onClose}>
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">اسم المشروب</label>
          <input
            className="field"
            placeholder="مثلاً: كورتادو"
            value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }}
          />
        </div>

        {/* المحاصيل */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">
            من أي محصول يُحضَّر؟
          </label>
          <p className="mb-2 text-xs text-muted">
            اختر محصولاً أو أكثر وحدّد سعر المشروب من كلٍّ منها. إن كان أكثر من واحد
            يختار الباريستا المحصول عند البيع، وينقص هو وحده من المخزون.
          </p>

          <div className="space-y-2">
            {crops.map((c) => {
              const on = c.id in picked;
              return (
                <div key={c.id} className={`rounded-xl border p-3 ${on ? "border-accent bg-accent/5" : "border-line bg-cream"}`}>
                  <button
                    type="button"
                    onClick={() => toggleCrop(c.id)}
                    className="flex w-full items-center gap-3 text-right"
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border text-xs ${
                        on ? "border-accent bg-accent text-cream" : "border-line"
                      }`}
                    >
                      {on ? "✓" : ""}
                    </span>
                    <span className="flex-1 text-sm font-medium text-ink">{c.name}</span>
                    <span className="nums text-[11px] text-muted">{c.stock} غ</span>
                  </button>

                  {on && (
                    <div className="mt-2 flex items-center gap-2 pr-8">
                      <input
                        type="number"
                        inputMode="numeric"
                        dir="ltr"
                        placeholder="السعر"
                        className="field nums w-32 text-center"
                        value={picked[c.id]}
                        onChange={(e) => {
                          setPicked((p) => ({ ...p, [c.id]: e.target.value }));
                          setError(null);
                        }}
                      />
                      <span className="text-xs text-muted">{currency}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {addingCrop ? (
            <div className="mt-2 flex gap-2">
              <input
                className="field flex-1"
                placeholder="اسم المحصول الجديد"
                value={newCrop}
                onChange={(e) => setNewCrop(e.target.value)}
              />
              <button onClick={addCrop} disabled={pending} className="btn-ghost px-4 text-sm">
                إضافة
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCrop(true)}
              className="mt-2 text-sm text-accent underline"
            >
              + محصول جديد
            </button>
          )}
        </div>

        {/* الوصفة */}
        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">الوصفة</label>
          <p className="mb-2 text-xs text-muted">
            هذه الكميات تُخصم من المخزون عند كل بيع. الباريستا لا يستطيع تغييرها.
          </p>

          <div className="space-y-3">
            <Row label="حبوب القهوة (غرام)">
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                className="field nums w-28 text-center"
                value={coffeeGrams}
                onChange={(e) => setCoffeeGrams(e.target.value)}
              />
            </Row>
            <Row label="الحليب (مل)">
              <input
                type="number"
                inputMode="numeric"
                dir="ltr"
                className="field nums w-28 text-center"
                value={milkMl}
                onChange={(e) => setMilkMl(e.target.value)}
              />
            </Row>
            <Row label="كوب وغطاء للسفري">
              <button
                type="button"
                onClick={() => setTakeawayCup((v) => !v)}
                className={`tap flex h-8 w-14 items-center rounded-full p-1 transition-colors ${
                  takeawayCup ? "bg-accent" : "bg-dark/15"
                }`}
              >
                <span
                  className={`h-6 w-6 rounded-full bg-cream transition-transform ${
                    takeawayCup ? "-translate-x-6" : ""
                  }`}
                />
              </button>
            </Row>
          </div>
          <p className="mt-2 text-[11px] text-muted">
            الكوب والغطاء يُخصمان للطلب السفري فقط، لا للجلوس.
          </p>
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <button onClick={submit} disabled={pending} className="btn-primary w-full">
          {pending ? "…" : "إنشاء المشروب"}
        </button>
      </div>
    </Modal>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-ink">{label}</span>
      {children}
    </div>
  );
}
