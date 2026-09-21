"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { sendFeedbackAction } from "@/app/feedback-actions";

/**
 * «قل لنا رأيك» في ذيل المنيو.
 *
 * **يصل المالك ولا يُنشر.** ويُقال هذا للزبون بالحرف: من يظنّ كلامه
 * سيُعرض يكتب للناس لا لصاحب المحلّ، فيُجامل أو يُقسو — وكلاهما
 * عديم النفع لمن يريد أن يُصلح.
 *
 * والحقول كلّها اختيارية إلّا واحداً منها: نجمةٌ أو كلمة. واشتراط
 * الهاتف يُسكت أكثر ممّا يُنطق، ومن كتب شكوى وهو يعرف أنه معروف
 * يُلطّفها حتى تضيع.
 */
export default function FeedbackSheet({
  items,
}: {
  items: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [productId, setProductId] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  /**
   * الإغلاق يُنظّف.
   *
   * بدونه يبقى «وصلَنا. شكراً» محفوظاً في الحالة، فمن أرسل رأياً ثمّ
   * أراد أن يضيف آخر يفتح الورقة فيجد شكراً لا حقولاً — ولا يفهم
   * لماذا، فيغلق المنيو. (ظهر في الاختبار.)
   */
  function close() {
    setOpen(false);
    setDone(false);
    setError(null);
    setRating(null);
    setNote("");
    setProductId("");
    setPhone("");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  function send() {
    if (pending) return;
    setError(null);
    start(async () => {
      const res = await sendFeedbackAction({
        rating,
        note,
        productId: productId || null,
        phone,
        deviceKey: deviceKey(),
      });
      if (!res.ok) return setError(res.error);
      setDone(true);
    });
  }

  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-4 text-xs text-muted underline underline-offset-4"
      >
        قل لنا رأيك
      </button>
    );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="رأيك"
    >
      <button
        aria-label="إغلاق"
        onClick={close}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] motion-safe:animate-[fadein_.25s_ease]"
      />
      <div
        ref={panel}
        tabIndex={-1}
        dir="rtl"
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-cream p-6 text-right outline-none sm:rounded-[1.75rem] motion-safe:animate-[sheetup_.36s_cubic-bezier(0.22,0.68,0,1)]"
      >
        {done ? (
          <div className="py-8 text-center">
            <p className="font-serifar text-2xl text-ink">وصلَنا. شكراً لك.</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              يقرؤه صاحب المحلّ بنفسه.
            </p>
            <button onClick={close} className="btn-primary mt-6 w-full">
              أغلق
            </button>
          </div>
        ) : (
          <>
            <h2 className="font-serifar text-2xl text-ink">رأيك</h2>
            {/* الوعد صريحٌ لأنه يُغيّر ما يُكتب */}
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              يصل صاحب المحلّ وحده — لا يُنشر على المنيو ولا يراه أحد غيره.
            </p>

            <div className="mt-5">
              <p className="mb-2 text-xs text-muted">كيف كانت زيارتك؟</p>
              <div className="flex justify-between gap-1.5" dir="ltr">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setRating(rating === n ? null : n)}
                    aria-label={`${n} من ٥`}
                    aria-pressed={rating === n}
                    className={`tap flex h-12 flex-1 items-center justify-center rounded-xl text-xl transition-colors ${
                      rating !== null && n <= rating
                        ? "bg-accent text-cream"
                        : "border border-line bg-sand text-muted"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs text-muted">
                عن مشروبٍ بعينه؟ (اختياري)
              </label>
              <select
                className="field text-sm"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">عن الزيارة كلّها</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs text-muted">
                ماذا تقول لنا؟
              </label>
              <textarea
                className="field min-h-[6rem] text-sm"
                maxLength={500}
                placeholder="ما أعجبك، وما لم يعجبك — كلاهما ينفعنا."
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-xs text-muted">
                هاتفك إن أردت ردّاً (اختياري)
              </label>
              <input
                type="tel"
                inputMode="numeric"
                dir="ltr"
                className="field nums text-sm"
                placeholder="07XXXXXXXXX"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            {error && (
              <p className="mt-3 text-center text-sm font-medium text-red-600">{error}</p>
            )}

            <div className="mt-5 flex gap-2">
              <button onClick={close} className="btn-ghost flex-1 py-3 text-sm">
                ليس الآن
              </button>
              <button
                onClick={send}
                disabled={pending}
                className="btn-primary flex-[2] disabled:opacity-40"
              >
                {pending ? "..." : "أرسل"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * مفتاحٌ للجهاز يعيش في المتصفّح — للحدّ لا للتعريف.
 *
 * لا يُربط باسمٍ ولا رقم، ولا يُرسل إلّا مع الرأي. وغرضه أن يمنع من
 * يُغرق الصندوق، لا أن يعرف من كتب.
 */
function deviceKey(): string {
  try {
    const k = "khazf_dev";
    let v = localStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    // وضع التصفّح الخاصّ يمنع التخزين — والرأي أولى من الحدّ الدقيق
    return "anon";
  }
}
