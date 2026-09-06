"use client";

import { useMemo, useState } from "react";
import { money } from "@/lib/format";
import type { CatalogProduct } from "@/lib/catalog";
import type { CartLine } from "@/components/PosScreen";

export default function ModifierSheet({
  product,
  currency,
  onAdd,
  onClose,
}: {
  product: CatalogProduct;
  currency: string;
  onAdd: (line: Omit<CartLine, "key" | "qty">) => void;
  onClose: () => void;
}) {
  const crops = product.crops.filter((c) => c.available);
  const [cropId, setCropId] = useState<string>(crops.length === 1 ? crops[0].material_id : "");
  // single groups → optionId | ""; multi groups → Set of ids
  const [singles, setSingles] = useState<Record<string, string>>({});
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-dark/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-sand p-6 shadow-lift sm:rounded-3xl" dir="rtl" onClick={(e) => e.stopPropagation()}>
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
