"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { CatalogProduct } from "@/lib/catalog";
import type { CartLine } from "@/components/PosScreen";

export default function ModifierSheet({
  product,
  currency,
  onAdd,
  fulfillment,
  onClose,
}: {
  product: CatalogProduct;
  currency: string;
  onAdd: (line: Omit<CartLine, "key" | "qty">) => void;
  /** يحدّد أي رصيد يُقاس عليه: الكوب والغطاء للسفري وحده. */
  fulfillment: "takeaway" | "dine_in";
  onClose: () => void;
}) {
  // المحصول الذي لا يكفي مخزونه كوباً واحداً لا يُعرض خياراً: اختياره
  // يعني طلباً يفشل عند الدفع بعد أن حُضِّر المشروب.
  const inStock = (c: CatalogProduct["crops"][number]) =>
    (fulfillment === "takeaway" ? c.servings_takeaway : c.servings_dine_in) > 0;
  const crops = product.crops.filter((c) => c.available && inStock(c));
  const [cropId, setCropId] = useState<string>(crops.length === 1 ? crops[0].material_id : "");
  // single groups → optionId | ""; multi groups → Set of ids
  //
  // المجموعة **الإلزامية** تبدأ مختارةً على الخيار المجّاني (الحليب البقري
  // مثلاً): هو ما يطلبه أكثر الزبائن. بدون ذلك يفتح اللاتيه — أكثر ما يُباع —
  // حواراً يتطلّب ضغطتين في كل مرّة، والضغطة الزائدة تتكرّر مئة مرّة في اليوم.
  // ومن أراد غيره يبدّله بضغطة واحدة، فلا شيء خُفي.
  const [singles, setSingles] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const g of product.groups) {
      if (g.selection !== "single" || !g.required || g.options.length === 0) continue;
      const free = g.options.find((o) => o.price_delta === 0) ?? g.options[0];
      init[g.id] = free.id;
    }
    return init;
  });
  const [multis, setMultis] = useState<Record<string, Set<string>>>({});

  const crop = crops.find((c) => c.material_id === cropId);

  const chosen = useMemo(() => {
    const out: { id: string; name: string; price_delta: number }[] = [];
    for (const g of product.groups) {
      if (g.selection === "single") {
        const oid = singles[g.id];
        const o = g.options.find((x) => x.id === oid);
        if (o) out.push(o);
      } else {
        const set = multis[g.id];
        if (set) for (const o of g.options) if (set.has(o.id)) out.push(o);
      }
    }
    return out;
  }, [product.groups, singles, multis]);

  const price = (crop?.price ?? 0) + chosen.reduce((s, o) => s + o.price_delta, 0);
  const missingCrop = crops.length > 1 && !cropId;
  const missingRequired = product.groups.some(
    (g) => g.required && g.selection === "single" && !singles[g.id]
  );

  function toggleMulti(gid: string, oid: string) {
    setMultis((prev) => {
      const set = new Set(prev[gid] ?? []);
      if (set.has(oid)) set.delete(oid);
      else set.add(oid);
      return { ...prev, [gid]: set };
    });
  }

  function add() {
    if (missingCrop || missingRequired || !crop) return;
    onAdd({
      product_id: product.id,
      name: product.name,
      crop_material_id: crop.material_id,
      crop_name: crop.crop_name,
      unit_price: price,
      options: chosen.map((o) => ({ id: o.id, name: o.name, price_delta: o.price_delta })),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-dark/50 backdrop-blur-sm motion-safe:animate-[fadein_.25s_ease]" />
      <div className="relative max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-sand p-6 shadow-lift sm:rounded-3xl motion-safe:animate-[sheetup_.32s_cubic-bezier(0.22,0.68,0,1)]" dir="rtl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h3 className="font-display text-xl font-bold text-ink">{product.name}</h3>
            <p className="text-sm text-muted">اختر التفاصيل</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-dark/5 text-muted">✕</button>
        </div>

        {/* المحصول */}
        {crops.length > 1 && (
          <Group title="المحصول" required>
            {crops.map((c) => (
              <Pill key={c.material_id} active={cropId === c.material_id} onClick={() => setCropId(c.material_id)}>
                {c.crop_name} <span className="nums text-xs opacity-70">{money(c.price, "")}</span>
                {(() => {
                  const n = fulfillment === "takeaway" ? c.servings_takeaway : c.servings_dine_in;
                  return n > 0 && n <= 5 ? (
                    <span className="nums mr-1 text-[10px] text-amber-700">باقي {n}</span>
                  ) : null;
                })()}
              </Pill>
            ))}
          </Group>
        )}

        {/* مجموعات الخيارات */}
        {product.groups.map((g) => (
          <Group key={g.id} title={g.name} required={g.required && g.selection === "single"}>
            {g.selection === "single"
              ? g.options.map((o) => (
                  <Pill
                    key={o.id}
                    active={singles[g.id] === o.id}
                    onClick={() => setSingles((p) => ({ ...p, [g.id]: p[g.id] === o.id ? "" : o.id }))}
                  >
                    {o.name}{o.price_delta ? <span className="nums text-xs opacity-70"> +{money(o.price_delta, "")}</span> : null}
                  </Pill>
                ))
              : g.options.map((o) => (
                  <Pill key={o.id} active={!!multis[g.id]?.has(o.id)} onClick={() => toggleMulti(g.id, o.id)}>
                    {o.name}{o.price_delta ? <span className="nums text-xs opacity-70"> +{money(o.price_delta, "")}</span> : null}
                  </Pill>
                ))}
          </Group>
        ))}

        <button
          onClick={add}
          disabled={missingCrop || missingRequired}
          className="btn-primary mt-4 flex w-full items-center justify-between px-6 text-lg disabled:opacity-40"
        >
          <span>أضِف للطلب</span>
          <span className="nums">{money(price, currency)}</span>
        </button>
      </div>
    </div>
  );
}

function Group({ title, required, children }: { title: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center gap-2">
        <span className="font-display text-sm font-bold text-ink">{title}</span>
        {required && <span className="chip bg-accent/12 text-accentdeep text-[10px]">مطلوب</span>}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`tap rounded-xl border px-4 py-2.5 text-sm font-medium ${
        active ? "border-accent bg-accent/12 text-accentdeep" : "border-line bg-cream text-ink"
      }`}
    >
      {children}
    </button>
  );
}
