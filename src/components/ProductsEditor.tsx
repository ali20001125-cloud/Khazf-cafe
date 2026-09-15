"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { categoryLabel } from "@/lib/format";
import type { AdminProduct } from "@/lib/products-admin";
import {
  updateProductAction,
  addCropToProductAction,
  setCropAvailabilityAction,
  setRecipeAction,
  type ProductPatch,
} from "@/app/manage/products-actions";
import NewProductDialog, { type CropOption } from "@/components/NewProductDialog";

/** مادة تصلح مكوّناً في وصفة: حليب · كوب · غطاء — لا حبوب (لها حقلها). */
export type IngredientOption = { id: string; name: string; base_unit: "g" | "ml" | "pcs" };

export default function ProductsEditor({
  products,
  crops,
  ingredients,
  currency,
}: {
  products: AdminProduct[];
  /** محاصيل القهوة المتاحة — تُنشأ هنا أو من المخزون، وهي مواد لها رصيد. */
  crops: CropOption[];
  ingredients: IngredientOption[];
  currency: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">المشروبات والأسعار</h1>
          <p className="mt-1 text-sm text-muted">
            أي محصول يُحضَّر منه كل مشروب، وبأي سعر، وبأي وصفة. التغيير هنا لا يمسّ
            الفواتير القديمة — كل فاتورة تحتفظ بسعرها ووصفتها وقت البيع، وكل تعديل
            وصفةٍ يصنع نسخةً جديدة تبقى القديمة تحتها مقروءة.
          </p>
        </div>
        <button onClick={() => setAdding(true)} className="btn-primary px-4 py-2 text-sm">
          + مشروب جديد
        </button>
      </div>

      {products.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-display font-bold text-ink">لا مشروبات بعد</p>
          <p className="mt-1 text-sm text-muted">أضف أول مشروب لتبدأ البيع.</p>
        </div>
      )}

      {products.map((p) => (
        <ProductCard key={p.id} product={p} crops={crops} ingredients={ingredients} currency={currency} />
      ))}

      {adding && (
        <NewProductDialog crops={crops} currency={currency} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function unitOf(u: "g" | "ml" | "pcs") {
  return u === "g" ? "غم" : u === "ml" ? "مل" : "حبّة";
}

function ProductCard({
  product,
  crops,
  ingredients,
  currency,
}: {
  product: AdminProduct;
  crops: CropOption[];
  ingredients: IngredientOption[];
  currency: string;
}) {
  const router = useRouter();
  const [paused, setPaused] = useState(product.paused);
  const [active, setActive] = useState(product.active);
  const [grams, setGrams] = useState(product.coffee_grams);
  const [prices, setPrices] = useState<Record<string, number>>(
    Object.fromEntries(product.crops.map((c) => [c.id, c.price]))
  );
  // الوصفة تُحرَّر كقائمة كاملة لا كتعديلاتٍ على صفوف: النسخة الجديدة تُكتب
  // بأكملها، فما حُذف من هنا يُحذف منها.
  const [recipe, setRecipe] = useState(
    product.items.map((i) => ({
      material_id: i.material_id,
      name: i.material_name,
      base_unit: i.base_unit,
      qty: i.qty,
      only_takeaway: i.only_takeaway,
    }))
  );
  const [addCrop, setAddCrop] = useState("");
  const [addCropPrice, setAddCropPrice] = useState("");
  const [addIng, setAddIng] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const original = product.items
    .map((i) => `${i.material_id}:${i.qty}:${i.only_takeaway}`)
    .sort()
    .join("|");
  const nowRecipe = recipe
    .map((i) => `${i.material_id}:${i.qty}:${i.only_takeaway}`)
    .sort()
    .join("|");
  const recipeDirty = grams !== product.coffee_grams || nowRecipe !== original;

  const dirty =
    paused !== product.paused ||
    active !== product.active ||
    recipeDirty ||
    product.crops.some((c) => prices[c.id] !== c.price);

  // محاصيل لم تُربط بعد بهذا المشروب — «كالدي: إسبريسو وتقطير فقط» تُبنى من هنا
  const linkedIds = new Set(product.crops.map((c) => c.material_id));
  const freeCrops = crops.filter((c) => !linkedIds.has(c.id));
  const usedIng = new Set(recipe.map((i) => i.material_id));
  const freeIng = ingredients.filter((m) => !usedIng.has(m.id));

  function save() {
    if (pending || !dirty) return;
    setError(null);
    setNote(null);
    const patch: ProductPatch = {
      paused,
      active,
      crops: product.crops
        .filter((c) => prices[c.id] !== c.price)
        .map((c) => ({ id: c.id, price: prices[c.id] })),
    };
    start(async () => {
      const res = await updateProductAction(product.id, patch);
      if (!res.ok) return setError(res.error);

      if (recipeDirty) {
        const r = await setRecipeAction(product.id, grams, recipe);
        if (!r.ok) return setError(r.error);
        if (r.changed) setNote(`وصفة جديدة — نسخة ${r.version}`);
      }
      setSaved(true);
      router.refresh();
    });
  }

  function linkCrop() {
    const price = Number(addCropPrice);
    if (!addCrop) return setError("اختر المحصول");
    if (!Number.isFinite(price) || price <= 0) return setError("أدخل سعر المحصول");
    setError(null);
    start(async () => {
      const r = await addCropToProductAction(product.id, addCrop, price);
      if (!r.ok) return setError(r.error);
      setAddCrop("");
      setAddCropPrice("");
      router.refresh();
    });
  }

  function toggleCrop(id: string, available: boolean) {
    start(async () => {
      const r = await setCropAvailabilityAction(id, available);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className={`card p-4 ${!active ? "opacity-60" : ""}`}>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-display font-bold text-ink">{product.name}</span>
          <span className="mr-2 text-xs text-muted">{categoryLabel(product.category)}</span>
        </div>
        <div className="flex gap-2">
          <Toggle on={!paused} label={paused ? "موقوف" : "شغّال"} onClick={() => { setPaused(!paused); setSaved(false); }} />
        </div>
      </div>

      {/* المحاصيل وأسعارها */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-muted">يُحضَّر من</p>
        {product.crops.length === 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            لا محصول مربوط — هذا المشروب لا يُباع حتى تربط له واحداً.
          </p>
        )}
        {product.crops.map((c) => (
          <div key={c.id} className={`flex items-center justify-between ${c.available ? "" : "opacity-50"}`}>
            <button
              onClick={() => toggleCrop(c.id, !c.available)}
              className="text-right text-sm text-ink hover:text-accentdeep"
              title={c.available ? "إيقافه عن هذا المشروب" : "إعادته"}
            >
              {c.crop_name}
              <span className="mr-1.5 text-[11px] text-muted">{c.available ? "" : "(موقوف)"}</span>
            </button>
            <div className="flex items-center gap-1">
              <input
                type="number" inputMode="numeric" value={prices[c.id]}
                onChange={(e) => { setPrices((p) => ({ ...p, [c.id]: Number(e.target.value) })); setSaved(false); }}
                className="field nums w-28 py-2 text-center" dir="ltr"
              />
              <span className="w-8 text-xs text-muted">{currency}</span>
            </div>
          </div>
        ))}

        {freeCrops.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <select
              className="field flex-1 py-2 text-sm"
              value={addCrop}
              onChange={(e) => { setAddCrop(e.target.value); setError(null); }}
            >
              <option value="">+ اربط محصولاً</option>
              {freeCrops.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {addCrop && (
              <>
                <input
                  type="number" inputMode="numeric" dir="ltr" placeholder="السعر"
                  className="field nums w-24 py-2 text-center"
                  value={addCropPrice}
                  onChange={(e) => { setAddCropPrice(e.target.value); setError(null); }}
                />
                <button onClick={linkCrop} disabled={pending} className="btn-primary px-4 py-2 text-sm">
                  ربط
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* الوصفة */}
      <div className="mt-3 border-t border-line pt-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs font-semibold text-muted">الوصفة</p>
          {product.recipe_version > 0 && (
            <span className="nums text-[11px] text-muted">نسخة {product.recipe_version}</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm text-ink">حبوب المحصول المختار</span>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="numeric" value={grams} onChange={(e) => { setGrams(Number(e.target.value)); setSaved(false); }} className="field nums w-24 py-2 text-center" dir="ltr" />
            <span className="w-10 text-xs text-muted">غم</span>
          </div>
        </div>

        {recipe.map((i, idx) => (
          <div key={i.material_id} className="mt-2 flex items-center justify-between">
            <span className="text-sm text-ink">
              {i.name}
              {i.only_takeaway && <span className="mr-1.5 text-[11px] text-muted">(سفري فقط)</span>}
            </span>
            <div className="flex items-center gap-1">
              <input
                type="number" inputMode="numeric" dir="ltr"
                className="field nums w-24 py-2 text-center"
                value={i.qty}
                onChange={(e) => {
                  const q = Number(e.target.value);
                  setRecipe((r) => r.map((x, k) => (k === idx ? { ...x, qty: q } : x)));
                  setSaved(false);
                }}
              />
              <span className="w-10 text-xs text-muted">{unitOf(i.base_unit)}</span>
              <button
                onClick={() => { setRecipe((r) => r.filter((_, k) => k !== idx)); setSaved(false); }}
                className="px-1 text-sm text-muted hover:text-red-600"
                title="حذف من الوصفة"
              >
                ✕
              </button>
            </div>
          </div>
        ))}

        {freeIng.length > 0 && (
          <select
            className="field mt-2 py-2 text-sm"
            value={addIng}
            onChange={(e) => {
              const m = ingredients.find((x) => x.id === e.target.value);
              if (m) {
                setRecipe((r) => [
                  ...r,
                  { material_id: m.id, name: m.name, base_unit: m.base_unit, qty: 1, only_takeaway: m.base_unit === "pcs" },
                ]);
                setSaved(false);
              }
              setAddIng("");
            }}
          >
            <option value="">+ أضف مكوّناً</option>
            {freeIng.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        )}

        {recipeDirty && (
          <p className="mt-2 rounded-lg bg-sand px-3 py-2 text-[11px] text-muted">
            الحفظ يصنع <span className="font-semibold text-ink">نسخة وصفة جديدة</span>.
            المبيعات السابقة تبقى محسوبةً بالوصفة القديمة.
          </p>
        )}
      </div>

      {error && <div className="mt-2 text-center text-sm text-red-600">{error}</div>}
      {note && <div className="mt-2 text-center text-sm text-emerald-700">{note}</div>}
      <div className="mt-3 flex items-center justify-between">
        <button onClick={() => { setActive(!active); setSaved(false); }} className="text-xs text-muted">
          {active ? "تعطيل المشروب" : "تفعيل المشروب"}
        </button>
        <button onClick={save} disabled={pending || !dirty} className="btn-primary px-6 py-2 text-sm disabled:opacity-30">
          {pending ? "..." : saved ? "تم ✅" : "حفظ"}
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`chip ${on ? "bg-accent/12 text-accentdeep" : "bg-dark/5 text-muted"}`}>
      {label}
    </button>
  );
}
