"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money, num, timeAr } from "@/lib/format";
import { createPromoAction, stopPromoAction } from "@/app/manage/promo-actions";
import type { PromoRow } from "@/lib/promos";

/**
 * إدارة أكواد الخصم.
 *
 * كل بطاقةٍ تقول **ما كلّف** لا كم استُعمل: «٧ من ٢٠» رقمٌ لا معنى له
 * وحده، و«٧ مرّات · ١٤٬٠٠٠ د.ع» يقول ما خرج من الدرج.
 */
export default function PromoManager({
  rows,
  currency,
}: {
  rows: PromoRow[];
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount">("percent");
  const [value, setValue] = useState("10");
  const [maxUses, setMaxUses] = useState("20");
  const [days, setDays] = useState("7");
  const [minTotal, setMinTotal] = useState("0");
  const [maxDiscount, setMaxDiscount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await createPromoAction({
        code,
        kind,
        value: Number(value),
        minTotal: Number(minTotal) || 0,
        maxDiscount: maxDiscount ? Number(maxDiscount) : null,
        maxUses: Number(maxUses),
        days: Number(days),
      });
      if (!res.ok) return setError(res.error);
      setCode("");
      setOpen(false);
      router.refresh();
    });
  }

  function stop(id: string, c: string) {
    if (pending) return;
    if (!confirm(`إيقاف الكود ${c}؟ لن يُقبل بعدها، ويبقى سجلّ ما حُسم به.`)) return;
    setError(null);
    start(async () => {
      const res = await stopPromoAction(id);
      if (!res.ok) return setError(res.error);
      router.refresh();
    });
  }

  const live = rows.filter((r) => r.active && new Date(r.expiresAt) > new Date());
  const done = rows.filter((r) => !live.includes(r));

  return (
    <div className="space-y-4">
      {!open ? (
        <button onClick={() => setOpen(true)} className="btn-primary w-full">
          + كود جديد
        </button>
      ) : (
        <section className="card p-5">
          <h2 className="font-display font-bold text-ink">كود جديد</h2>

          <div className="mt-4 space-y-3">
            <div>
              <label className="mb-1.5 block text-xs text-muted">الكود</label>
              <input
                dir="ltr"
                className="field text-center font-mono text-lg tracking-widest"
                placeholder="KHAZAF20"
                maxLength={20}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
              />
              <p className="mt-1 text-[0.7rem] text-muted">
                حروف إنجليزية وأرقام. الحروف الصغيرة والكبيرة سواء عند الاستعمال.
              </p>
            </div>

            <div className="flex gap-1.5">
              {([
                { v: "percent", label: "نسبة ٪" },
                { v: "amount", label: "مبلغ ثابت" },
              ] as const).map((k) => (
                <button
                  key={k.v}
                  type="button"
                  onClick={() => setKind(k.v)}
                  className={`tap flex-1 rounded-xl px-3 py-2.5 text-sm font-medium ${
                    kind === k.v ? "bg-dark text-cream" : "border border-line bg-sand text-muted"
                  }`}
                >
                  {k.label}
                </button>
              ))}
            </div>

            <Field
              label={kind === "percent" ? "النسبة (١ إلى ٥٠)" : `المبلغ (${currency})`}
              value={value}
              set={setValue}
            />

            <div className="grid grid-cols-2 gap-3">
              <Field label="عدد المرّات" value={maxUses} set={setMaxUses} />
              <Field label="ينتهي بعد (أيام)" value={days} set={setDays} />
            </div>

            <details className="rounded-xl border border-line bg-sand/50 p-3">
              <summary className="cursor-pointer text-xs text-muted">
                حدودٌ إضافية (اختيارية)
              </summary>
              <div className="mt-3 space-y-3">
                <Field
                  label={`لا يُقبل تحت (${currency})`}
                  value={minTotal}
                  set={setMinTotal}
                />
                {kind === "percent" && (
                  <Field
                    label={`أقصى حسم (${currency}) — فارغٌ يعني بلا سقف`}
                    value={maxDiscount}
                    set={setMaxDiscount}
                  />
                )}
              </div>
            </details>

            {/* السقفان مذكوران صراحةً لأنهما سبب وجود الشاشة */}
            <p className="rounded-xl bg-amber-50 p-3 text-[0.72rem] leading-relaxed text-amber-900">
              الكود يُصوَّر ويُنشر. ولذلك عدد المرّات وتاريخ الانتهاء مطلوبان
              دائماً — بلا سقفٍ قد يأتي مئةٌ بخصمٍ في يومٍ واحد.
            </p>

            {error && (
              <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setError(null);
                }}
                className="btn-ghost flex-1 py-3 text-sm"
              >
                إلغاء
              </button>
              <button
                onClick={create}
                disabled={pending}
                className="btn-primary flex-[2] disabled:opacity-40"
              >
                {pending ? "..." : "أنشئ"}
              </button>
            </div>
          </div>
        </section>
      )}

      {error && !open && (
        <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>
      )}

      {rows.length === 0 && (
        <div className="card p-10 text-center">
          <p className="font-display font-bold text-ink">لا أكواد</p>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
            الكود يُكتب على منشورٍ أو يُعطى لزبونٍ اشتكى. والباريستا يكتبه في
            شاشة الدفع فيُحسم المبلغ.
          </p>
        </div>
      )}

      {live.length > 0 && (
        <div className="space-y-2.5">
          {live.map((r) => (
            <Card key={r.id} r={r} currency={currency} onStop={() => stop(r.id, r.code)} />
          ))}
        </div>
      )}

      {done.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="mt-6 text-xs font-semibold text-muted">منتهية وموقوفة</h3>
          {done.map((r) => (
            <Card key={r.id} r={r} currency={currency} />
          ))}
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  set,
}: {
  label: string;
  value: string;
  set: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs text-muted">{label}</label>
      <input
        type="number"
        inputMode="numeric"
        dir="ltr"
        min={0}
        className="field nums text-center"
        value={value}
        onChange={(e) => set(e.target.value)}
      />
    </div>
  );
}

function Card({
  r,
  currency,
  onStop,
}: {
  r: PromoRow;
  currency: string;
  onStop?: () => void;
}) {
  const expired = new Date(r.expiresAt) <= new Date();
  const full = r.usedCount >= r.maxUses;
  const dead = !r.active || expired || full;

  return (
    <article className={`card p-4 ${dead ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span dir="ltr" className="font-mono text-base font-bold tracking-widest text-ink">
          {r.code}
        </span>
        <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-xs font-semibold text-accentdeep">
          {r.kind === "percent" ? `${num(r.value)}٪` : money(r.value, currency)}
        </span>
        {!r.active && (
          <span className="rounded-full bg-sand px-2 py-0.5 text-[0.65rem] text-muted">موقوف</span>
        )}
        {r.active && expired && (
          <span className="rounded-full bg-sand px-2 py-0.5 text-[0.65rem] text-muted">انتهى</span>
        )}
        {r.active && !expired && full && (
          <span className="rounded-full bg-sand px-2 py-0.5 text-[0.65rem] text-muted">
            اكتمل العدد
          </span>
        )}
        {onStop && !dead && (
          <button onClick={onStop} className="mr-auto text-xs text-red-600 underline">
            أوقفه
          </button>
        )}
      </div>

      {/* ما كلّف، لا كم استُعمل */}
      <p className="nums mt-2 text-sm text-ink">
        {num(r.usedCount)} من {num(r.maxUses)}
        {r.totalGiven > 0 && (
          <span className="text-muted">
            {" · "}كلّفك <span className="font-semibold text-ink">{money(r.totalGiven, currency)}</span>
          </span>
        )}
      </p>

      <p className="mt-1 text-[0.7rem] text-muted">
        ينتهي <span dir="ltr" className="nums">{timeAr(r.expiresAt)}</span>
        {r.minTotal > 0 && ` · لا يُقبل تحت ${money(r.minTotal, currency)}`}
        {r.maxDiscount !== null && ` · بحدّ أقصى ${money(r.maxDiscount, currency)}`}
      </p>
    </article>
  );
}
