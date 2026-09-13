"use client";

import { useState } from "react";
import { timeAr } from "@/lib/format";
import type { AwaitingCount } from "@/lib/shifts";
import CountDrawerDialog from "@/components/CountDrawerDialog";

/**
 * ورديات أُغلقت والدرج بانتظار عدّك.
 * كلّما طال الانتظار ضعف معنى العدّ — الدرج يُفتح ويُغلق، والمسؤولية تذوب.
 */
export default function AwaitingCountList({
  rows,
  currency,
}: {
  rows: AwaitingCount[];
  currency: string;
}) {
  const [open, setOpen] = useState<AwaitingCount | null>(null);
  if (rows.length === 0) return null;

  return (
    <div className="card border-amber-200 bg-amber-50/50 p-4">
      <p className="font-display font-bold text-amber-900">
        {rows.length === 1
          ? "درجٌ بانتظار عدّك"
          : `${rows.length} أدراج بانتظار عدّك`}
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => setOpen(r)}
              className="flex w-full items-center justify-between rounded-lg bg-cream/70 px-3 py-2 text-right text-sm text-ink hover:bg-cream"
            >
              <span>
                وردية {r.employee_name}
                <span className="mr-2 text-xs text-muted">
                  أُغلقت {timeAr(r.closed_at)}
                </span>
              </span>
              <span className="shrink-0 text-xs text-accent">اعدد ←</span>
            </button>
          </li>
        ))}
      </ul>
      {open && (
        <CountDrawerDialog
          shiftId={open.id}
          employeeName={open.employee_name}
          currency={currency}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
