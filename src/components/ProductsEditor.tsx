"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { categoryLabel } from "@/lib/format";
import type { AdminProduct } from "@/lib/products-admin";
import { updateProductAction, type ProductPatch } from "@/app/manage/products-actions";
import NewProductDialog, { type CropOption } from "@/components/NewProductDialog";

export default function ProductsEditor({
  products,
  crops,
  currency,
}: {
  products: AdminProduct[];
  /** محاصيل القهوة المتاحة — تُنشأ هنا أو من المخزون، وهي مواد لها رصيد. */
  crops: CropOption[];
  currency: string;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">المشروبات والأسعار</h1>
          <p className="mt-1 text-sm text-muted">
            سعر كل محصول، وغرامات الحبوب، والحليب. التغيير هنا لا يمسّ الفواتير القديمة —
            كل فاتورة تحتفظ بسعرها ووصفتها وقت البيع.
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
        <ProductCard key={p.id} product={p} currency={currency} />
      ))}

      {adding && (
        <NewProductDialog crops={crops} currency={currency} onClose={() => setAdding(false)} />
      )}
    </div>
  );
}

function ProductCard({ product, currency }: { product: AdminProduct; currency: string }) {
  const router = useRouter();
  const [paused, setPaused] = useState(product.paused);
  const [active, setActive] = useState(product.active);
  const [grams, setGrams] = useState(product.coffee_grams);
  const [prices, setPrices] = useState<Record<string, number>>(
    Object.fromEntries(product.crops.map((c) => [c.id, c.price]))
  );
  const [items, setItems] = useState<Record<string, number>>(
    Object.fromEntries(product.items.map((i) => [i.id, i.qty]))
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty =
    paused !== product.paused ||
    active !== product.active ||
    grams !== product.coffee_grams ||
    product.crops.some((c) => prices[c.id] !== c.price) ||
    product.items.some((i) => items[i.id] !== i.qty);

  function save() {
    if (pending || !dirty) return;
    setError(null);
    const patch: ProductPatch = {
      paused, active, coffee_grams: grams,
      crops: product.crops.filter((c) => prices[c.id] !== c.price).map((c) => ({ id: c.id, price: prices[c.id] })),
      items: product.items.filter((i) => items[i.id] !== i.qty).map((i) => ({ id: i.id, qty: items[i.id] })),
    };
    start(async () => {
      const res = await updateProductAction(product.id, patch);
      if (res.ok) { setSaved(true); router.refresh(); }
      else setError(res.error);
    });
  }

  const milkItems = product.items.filter((i) => !i.only_takeaway);

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

      {/* أسعار المحاصيل */}
      <div className="space-y-2">
        {product.crops.map((c) => (
          <div key={c.id} className="flex items-center justify-between">
            <span className="text-sm text-ink">{c.crop_name}</span>
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
      </div>

      {/* الوصفة */}
      <div className="mt-3 border-t border-line pt-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">حبوب المشروب</span>
          <div className="flex items-center gap-1">
            <input type="number" inputMode="numeric" value={grams} onChange={(e) => { setGrams(Number(e.target.value)); setSaved(false); }} className="field nums w-24 py-2 text-center" dir="ltr" />
            <span className="w-8 text-xs text-muted">غم</span>
          </div>
        </div>
        {milkItems.map((i) => (
          <div key={i.id} className="mt-2 flex items-center justify-between">
            <span className="text-sm text-muted">{i.material_name}</span>
            <div className="flex items-center gap-1">
              <input type="number" inputMode="numeric" value={items[i.id]} onChange={(e) => { setItems((p) => ({ ...p, [i.id]: Number(e.target.value) })); setSaved(false); }} className="field nums w-24 py-2 text-center" dir="ltr" />
              <span className="w-8 text-xs text-muted">مل</span>
            </div>
          </div>
        ))}
      </div>

      {error && <div className="mt-2 text-center text-sm text-red-600">{error}</div>}
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
