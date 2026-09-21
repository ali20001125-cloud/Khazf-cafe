"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { timeAr } from "@/lib/format";
import { markFeedbackReadAction } from "@/app/feedback-actions";
import type { FeedbackRow } from "@/lib/feedback";

/**
 * بريد الآراء.
 *
 * مرتّبٌ بالأحدث لا بالتقييم: رأيُ اليوم يُتصرّف فيه، ورأيُ الشهر
 * الماضي تاريخ. والمقروء يبهت ولا يُخفى — فالمالك قد يعود إليه.
 */
export default function FeedbackInbox({ rows }: { rows: FeedbackRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const unread = rows.filter((r) => !r.read);

  function markAll() {
    if (pending || unread.length === 0) return;
    setError(null);
    start(async () => {
      const res = await markFeedbackReadAction(unread.map((r) => r.id));
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  if (rows.length === 0)
    return (
      <div className="card p-10 text-center">
        <p className="font-display font-bold text-ink">لا آراء بعد</p>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
          في ذيل المنيو زرُّ «قل لنا رأيك». ما يُكتب فيه يصل هنا — ولا
          يظهر للزبائن الآخرين.
        </p>
      </div>
    );

  return (
    <div className="space-y-3">
      {unread.length > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-accent/10 px-4 py-2.5">
          <span className="nums text-sm font-medium text-accentdeep">
            {unread.length} جديد
          </span>
          <button
            onClick={markAll}
            disabled={pending}
            className="text-xs font-medium text-accentdeep underline disabled:opacity-40"
          >
            {pending ? "..." : "علّم الكلّ مقروءاً"}
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>
      )}

      {rows.map((r) => (
        <article
          key={r.id}
          className={`card p-4 ${r.read ? "opacity-60" : "ring-1 ring-accent/30"}`}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {r.rating !== null && (
              <span dir="ltr" className="text-sm text-accent">
                {"★".repeat(r.rating)}
                <span className="text-line">{"★".repeat(5 - r.rating)}</span>
              </span>
            )}
            {r.productName && (
              <span className="rounded-full bg-sand px-2 py-0.5 text-[0.65rem] text-muted">
                {r.productName}
              </span>
            )}
            <span className="nums mr-auto text-[0.7rem] text-muted" dir="ltr">
              {timeAr(r.createdAt)}
            </span>
          </div>

          {r.note && (
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {r.note}
            </p>
          )}

          {/* الهاتف زرُّ اتّصال لا نصّ يُنسخ بالإصبع */}
          {r.phone && (
            <a
              href={`tel:${r.phone}`}
              dir="ltr"
              className="nums mt-2.5 inline-block rounded-lg bg-sand px-3 py-1.5 text-xs text-ink"
            >
              📞 {r.phone}
            </a>
          )}
        </article>
      ))}
    </div>
  );
}
