"use client";

import { useState } from "react";
import { stockLabel, num } from "@/lib/format";
import type { ShoppingRow } from "@/lib/inventory-overview";

/**
 * قائمة الشراء كما تُقرأ في السوق: سطرٌ لكل مادة، وكمية بوحدة الشراء،
 * ومربّع يُعلَّم عند الشراء. التعليم محلّي في الجهاز — هو مساعدة ذاكرة
 * أثناء الجولة، والمخزون لا يتغيّر إلا بتسجيل شراء فعلي.
 */
export default function ShoppingListView({ rows }: { rows: ShoppingRow[] }) {
  const [done, setDone] = useState<Set<string>>(new Set());

  const toggle = (id: string) =>
    setDone((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const tone = {
    out: { chip: "bg-red-100 text-red-700", label: "نفد" },
    low: { chip: "bg-amber-100 text-amber-800", label: "قلّ" },
    top_up: { chip: "bg-dark/5 text-muted", label: "أكمِل" },
    ok: { chip: "bg-dark/5 text-muted", label: "" },
  };

  return (
    <div className="card divide-y divide-line">
      {rows.map((r) => {
        const checked = done.has(r.material_id);
        const t = tone[r.urgency];
        return (
          <button
            key={r.material_id}
            onClick={() => toggle(r.material_id)}
            className={`tap flex w-full items-center gap-3 p-4 text-right ${
              checked ? "opacity-45" : ""
            }`}
          >
            <span
              aria-hidden
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${
                checked ? "border-accent bg-accent text-cream" : "border-line bg-cream"
              }`}
            >
              {checked ? "✓" : ""}
            </span>

            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={`font-display font-bold text-ink ${checked ? "line-through" : ""}`}>
                  {r.name}
                </span>
                {t.label && <span className={`chip ${t.chip}`}>{t.label}</span>}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                الآن {stockLabel(r.stock, r.base_unit)}
                {r.days_left != null && ` · يكفي ${num(r.days_left)} يوم تقريباً`}
              </span>
            </span>

            <span className="shrink-0 text-left">
              {r.need_units != null && r.unit_name ? (
                <>
                  <span className="nums font-display text-lg font-bold text-ink">
                    {num(r.need_units)}
                  </span>
                  <span className="mr-1 text-xs text-muted">{r.unit_name}</span>
                </>
              ) : r.need_base > 0 ? (
                <span className="nums font-display text-lg font-bold text-ink">
                  {stockLabel(r.need_base, r.base_unit)}
                </span>
              ) : (
                <span className="text-xs text-muted">—</span>
              )}
            </span>
          </button>
        );
      })}

      <p className="p-3 text-center text-xs text-muted">
        التعليم للذاكرة أثناء الجولة فقط. المخزون يتغيّر بتسجيل الشراء لا
        بالتعليم هنا.
      </p>
    </div>
  );
}
