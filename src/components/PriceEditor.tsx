"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money, num, categoryLabel } from "@/lib/format";
import { updatePricesAction } from "@/app/manage/prices-actions";
import { bumpPrice } from "@/lib/price-math";
import type { PriceRow } from "@/lib/prices";

/**
 * تعديل الأسعار جملةً.
 *
 * ثلاث قواعد تحكم هذه الشاشة، وكلّها لأن السعر مال:
 *
 * ١. **لا شيء يُحفظ حتى يُرى.** النسبة تُحسب هنا وتُعرض «من ← إلى»،
 *    ثم يُرسل الرقم النهائي. فلو ضُغط الحفظ مرّتين بقي السعر كما رآه
 *    صاحبه — ولو أُرسلت النسبة لتُحسب في الخادم لتضاعفت.
 *
 * ٢. **التقريب يُختار.** رفعُ ٣٬٠٠٠ عشرةً بالمئة يعطي ٣٬٣٠٠، وهذا
 *    سعرٌ يُربك الفكّة. والتقريب إلى ٢٥٠ يعطي ٣٬٢٥٠ — رقمٌ يُدفع.
 *
 * ٣. **الهامش مرئيٌّ وهو يُغيَّر.** لا بعد أن يُحفظ ويُكتشف في تقرير
 *    آخر الشهر أن مشروباً صار يُباع بأقلّ من تكلفته.
 */

const STEPS = [
  { v: 1, label: "بلا تقريب" },
  { v: 100, label: "١٠٠" },
  { v: 250, label: "٢٥٠" },
  { v: 500, label: "٥٠٠" },
  { v: 1000, label: "١٬٠٠٠" },
];

export default function PriceEditor({
  rows,
  currency,
}: {
  rows: PriceRow[];
  currency: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, number>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, r.price]))
  );
  const [percent, setPercent] = useState("");
  const [step, setStep] = useState(250);
  const [scope, setScope] = useState<string>("all");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const scopes = useMemo(() => {
    const cats = Array.from(new Set(rows.filter((r) => r.kind === "drink").map((r) => r.category)));
    return [
      { key: "all", label: "كل شيء" },
      { key: "drinks", label: "المشروبات" },
      ...cats.map((c) => ({ key: `cat:${c}`, label: categoryLabel(c) })),
      { key: "retail", label: "البضاعة" },
    ];
  }, [rows]);

  const inScope = (r: PriceRow) =>
    scope === "all" ||
    (scope === "drinks" && r.kind === "drink") ||
    (scope === "retail" && r.kind === "retail") ||
    (scope.startsWith("cat:") && r.kind === "drink" && r.category === scope.slice(4));

  const changed = rows.filter((r) => draft[r.id] !== r.price);

  function applyPercent() {
    const p = Number(percent);
    if (!Number.isFinite(p) || p === 0) return;
    setError(null);
    setSaved(false);
    // **من السعر المحفوظ لا من المسوّدة**: ضغطتان على «طبّق» تعنيان
    // نفس النتيجة لا ضعفها
    const next = { ...draft };
    for (const r of rows) if (inScope(r)) next[r.id] = bumpPrice(r.price, p, step);
    setDraft(next);
  }

  function reset() {
    setDraft(Object.fromEntries(rows.map((r) => [r.id, r.price])));
    setPercent("");
    setError(null);
    setSaved(false);
  }

  function save() {
    if (pending || changed.length === 0) return;
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updatePricesAction(
        changed.map((r) => ({ id: r.id, price: draft[r.id] }))
      );
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  const drinks = rows.filter((r) => r.kind === "drink");
  const goods = rows.filter((r) => r.kind === "retail");

  return (
    <div className="space-y-5">
      {/* الأداة */}
      <section className="card p-5">
        <h2 className="font-display font-bold text-ink">رفع أو خفض بنسبة</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          اكتب النسبة وانظر أثرها في الجدول أسفل — ثمّ احفظ. ولا شيء يُكتب
          قبل أن تراه.
        </p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted">على ماذا</label>
            <div className="flex flex-wrap gap-1.5">
              {scopes.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setScope(s.key)}
                  className={`tap rounded-full px-3 py-1.5 text-xs font-medium ${
                    scope === s.key
                      ? "bg-dark text-cream"
                      : "border border-line bg-sand text-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">قرّب إلى</label>
            <div className="flex flex-wrap gap-1.5">
              {STEPS.map((s) => (
                <button
                  key={s.v}
                  type="button"
                  onClick={() => setStep(s.v)}
                  className={`tap nums rounded-full px-3 py-1.5 text-xs font-medium ${
                    step === s.v
                      ? "bg-accent text-cream"
                      : "border border-line bg-sand text-muted"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="mb-1.5 block text-xs text-muted">
                النسبة ٪ — سالبةٌ للخفض
              </label>
              <input
                type="number"
                inputMode="decimal"
                dir="ltr"
                className="field nums text-center"
                placeholder="10"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={applyPercent}
              className="btn-ghost shrink-0 px-5 py-3 text-sm"
            >
              طبّق
            </button>
          </div>
        </div>
      </section>

      {/* الجدول */}
      <section className="card p-5">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display font-bold text-ink">الأسعار</h2>
          {changed.length > 0 && (
            <button onClick={reset} className="text-xs text-muted underline">
              تراجَع عن الكلّ
            </button>
          )}
        </div>

        <Group
          title="المشروبات"
          rows={drinks}
          draft={draft}
          setDraft={setDraft}
          currency={currency}
        />
        {goods.length > 0 && (
          <Group
            title="البضاعة"
            rows={goods}
            draft={draft}
            setDraft={setDraft}
            currency={currency}
            className="mt-6"
          />
        )}
      </section>

      {error && (
        <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>
      )}
      {saved && changed.length === 0 && (
        <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-700">
          تم الحفظ ✅
        </div>
      )}

      {/* الزرّ لاصقٌ في الأسفل: الجدول أطول من الشاشة، وزرُّ الحفظ في
          ذيله يعني تمريراً بعد كل تعديل */}
      <div className="sticky bottom-3 z-10">
        <button
          onClick={save}
          disabled={pending || changed.length === 0}
          className="btn-primary w-full shadow-lift disabled:opacity-40"
        >
          {pending
            ? "..."
            : changed.length === 0
              ? "لا تغييرات"
              : `احفظ ${changed.length} سعراً`}
        </button>
      </div>
    </div>
  );
}

function Group({
  title,
  rows,
  draft,
  setDraft,
  currency,
  className = "",
}: {
  title: string;
  rows: PriceRow[];
  draft: Record<string, number>;
  setDraft: (v: Record<string, number>) => void;
  currency: string;
  className?: string;
}) {
  if (rows.length === 0) return null;
  return (
    <div className={className}>
      <h3 className="mb-2 text-xs font-semibold text-muted">{title}</h3>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <Line
            key={r.id}
            row={r}
            value={draft[r.id]}
            set={(v) => setDraft({ ...draft, [r.id]: v })}
            currency={currency}
          />
        ))}
      </div>
    </div>
  );
}

function Line({
  row,
  value,
  set,
  currency,
}: {
  row: PriceRow;
  value: number;
  set: (v: number) => void;
  currency: string;
}) {
  const dirty = value !== row.price;
  const margin = value - row.cost;
  // تكلفةٌ صفرٌ تعني «غير مسجّلة» لا «مجّاني» — فالهامش عنها كذبة
  const knownCost = row.cost > 0;
  const loss = knownCost && margin <= 0;

  return (
    <div
      className={`rounded-xl border p-2.5 ${
        loss ? "border-red-300 bg-red-50/60" : dirty ? "border-accent/50 bg-accent/5" : "border-line bg-cream"
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink">{row.productName}</p>
          <p className="truncate text-[0.7rem] text-muted">
            {row.cropName}
            {!row.available && " · موقوف"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {dirty && (
            <span dir="ltr" className="nums text-[0.7rem] text-muted line-through">
              {num(row.price)}
            </span>
          )}
          <input
            type="number"
            inputMode="numeric"
            dir="ltr"
            min={0}
            className="field nums w-24 py-2 text-center text-sm"
            value={value}
            onChange={(e) => set(Math.max(0, Math.round(Number(e.target.value) || 0)))}
          />
        </div>
      </div>

      <p className="mt-1.5 text-[0.7rem] text-muted">
        {knownCost ? (
          <>
            التكلفة <span dir="ltr" className="nums">{money(row.cost, currency)}</span>
            {" · "}
            <span className={loss ? "font-semibold text-red-600" : "text-emerald-700"}>
              {loss ? "خسارة " : "ربح "}
              <span dir="ltr" className="nums">{num(Math.abs(margin))}</span>
            </span>
          </>
        ) : (
          <span className="text-amber-700">التكلفة غير مسجّلة — الربح مجهول</span>
        )}
      </p>
    </div>
  );
}
