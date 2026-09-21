"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBannerAction } from "@/app/manage/menu-actions";
import { bannerLive, dayKey, type BannerTone } from "@/lib/banner";

/**
 * شريطٌ أعلى المنيو يكتبه المالك.
 *
 * «مشروب اليوم: موكا الكراميل» · «مغلق للجرد اليوم» · «جرّب الجديد».
 *
 * وله تاريخُ انتهاء لأن الشريط الذي لا ينتهي يُنسى: يقرأ زبونُ الخميس
 * وعداً نفد يوم الثلاثاء. ولذلك يُعرض هنا صراحةً متى سيصمت، وما إن
 * كان ظاهراً الآن أصلاً.
 */
export default function BannerEditor({
  text: initText,
  tone: initTone,
  until: initUntil,
}: {
  text: string;
  tone: BannerTone;
  until: string | null;
}) {
  const router = useRouter();
  const [text, setText] = useState(initText);
  const [tone, setTone] = useState<BannerTone>(initTone);
  const [until, setUntil] = useState(initUntil ?? "");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const dirty =
    text !== initText || tone !== initTone || (until || null) !== (initUntil ?? null);

  const today = dayKey(new Date());
  const live = bannerLive({ text, tone, until: until || null }, new Date());
  const expired = text.trim().length > 0 && !!until && !live;

  function save() {
    if (pending) return;
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await updateBannerAction({ text, tone, until: until || null });
      if (!res.ok) return setError(res.error);
      setMsg("تم الحفظ ✅");
      router.refresh();
    });
  }

  return (
    <section className="card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tap flex w-full items-start justify-between gap-3 text-right"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="font-display font-bold text-ink">شريط أعلى المنيو</span>
            {initText.trim().length > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[0.62rem] font-semibold ${
                  bannerLive({ text: initText, tone: initTone, until: initUntil }, new Date())
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-sand text-muted"
                }`}
              >
                {bannerLive({ text: initText, tone: initTone, until: initUntil }, new Date())
                  ? "ظاهر الآن"
                  : "انتهى"}
              </span>
            )}
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">
            {initText.trim().length > 0
              ? initText
              : "«مشروب اليوم» · «مغلق للجرد» · «جرّب الجديد» — سطرٌ يراه الزبون قبل المنيو."}
          </span>
        </span>
        <span className="shrink-0 pt-1 text-muted">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1.5 block text-xs text-muted">النصّ — فارغٌ يعني لا شريط</label>
            <input
              className="field text-sm"
              maxLength={120}
              placeholder="مشروب اليوم: موكا الكراميل"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">النبرة</label>
            <div className="flex gap-1.5">
              {([
                { v: "news", label: "خبر" },
                { v: "warn", label: "تنبيه" },
              ] as const).map((t) => (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => setTone(t.v)}
                  className={`tap rounded-full px-4 py-1.5 text-xs font-medium ${
                    tone === t.v
                      ? t.v === "warn"
                        ? "bg-amber-500 text-white"
                        : "bg-dark text-cream"
                      : "border border-line bg-sand text-muted"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs text-muted">
              يصمت بعد — اتركه فارغاً ليبقى حتى تمسحه
            </label>
            <input
              type="date"
              dir="ltr"
              min={today}
              className="field nums text-sm"
              value={until}
              onChange={(e) => setUntil(e.target.value)}
            />
            {until && (
              <div className="mt-1.5 flex items-center gap-2">
                <p className="text-[0.7rem] text-muted">
                  يظهر طوال ذلك اليوم، ويختفي وحده في صباح ما بعده.
                </p>
                <button
                  type="button"
                  onClick={() => setUntil("")}
                  className="text-[0.7rem] text-muted underline"
                >
                  امسح التاريخ
                </button>
              </div>
            )}
            {expired && (
              <p className="mt-1.5 text-[0.7rem] font-medium text-amber-700">
                هذا التاريخ مضى — الشريط لن يظهر.
              </p>
            )}
          </div>

          {/* المعاينة: ما سيراه الزبون بالضبط، لا وصفٌ له */}
          {text.trim().length > 0 && (
            <div>
              <p className="mb-1.5 text-xs text-muted">كما يراه الزبون</p>
              <div
                className={`rounded-xl px-4 py-2.5 text-center text-sm font-medium ${
                  tone === "warn" ? "bg-amber-100 text-amber-900" : "bg-dark text-cream"
                } ${live ? "" : "opacity-40"}`}
              >
                {text}
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>
          )}
          {msg && !dirty && (
            <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-700">
              {msg}
            </div>
          )}

          <button
            onClick={save}
            disabled={pending || !dirty}
            className="btn-ghost w-full py-2.5 text-sm disabled:opacity-40"
          >
            {pending ? "..." : dirty ? "احفظ الشريط" : "لا تغييرات"}
          </button>
        </div>
      )}
    </section>
  );
}
