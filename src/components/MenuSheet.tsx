"use client";

import { useEffect, useRef } from "react";
import type { Strings } from "@/lib/menu-strings";
import DrinkArt, { artKind } from "./DrinkArt";
import type { BoardItem } from "./MenuBoard";

export type SheetDetail = {
  parts: { name: string; note: string | null; qty: number; unit: string }[];
  kcal: number;
  caffeine: number;
  known: boolean;
  kinds: { name: string; note: string | null }[];
};



/**
 * بطاقة المشروب.
 *
 * ورقةٌ تصعد من الأسفل لا صفحةٌ جديدة: الزبون واقفٌ عند الكاونتر، وزرّ
 * الرجوع في المتصفّح ليس شيئاً يُطلب منه أن يجده. والإغلاق من ثلاثة
 * أبواب — الخلفية، والزرّ، ومفتاح الهروب — لأن من لا يجد المخرج يغلق
 * المنيو كلّه.
 */
export default function MenuSheet({
  item,
  detail,
  s,
  onClose,
}: {
  item: BoardItem;
  detail: SheetDetail | undefined;
  /** كلمات الصفحة بلغتها — تُمرَّر ولا تُقرأ من سياق: الصفحة خادمية. */
  s: Strings;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);

    // الخلفية لا تُمرَّر تحت الورقة: من يسحب داخل البطاقة يجب ألّا
    // يضيّع موضعه في المنيو
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const kcalKnown = detail?.known && detail.kcal > 0;
  const cafKnown = detail?.known && detail.caffeine > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={item.name}
    >
      <button
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-ink/45 backdrop-blur-[2px] motion-safe:animate-[fadein_.25s_ease]"
      />

      <div
        ref={panel}
        tabIndex={-1}
        className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-[1.75rem] bg-cream outline-none sm:rounded-[1.75rem] motion-safe:animate-[sheetup_.42s_cubic-bezier(0.22,0.68,0,1)]"
      >
        {/* مقبض السحب: يقول «هذه ورقة تُغلق» بلا كلمة */}
        <div className="sticky top-0 z-10 flex justify-center bg-cream/80 pb-1 pt-2.5 backdrop-blur-sm sm:hidden">
          <span className="h-1 w-10 rounded-full bg-ink/15" />
        </div>

        <div className="relative">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className={`aspect-[4/3] w-full object-cover ${item.paused ? "opacity-60 grayscale" : ""}`}
            />
          ) : (
            <DrinkArt
              name={item.name}
              kind={artKind(item.category, item.kind)}
              className={`aspect-square w-full ${item.paused ? "opacity-60 grayscale" : ""}`}
            />
          )}
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-cream/90 text-ink shadow-soft backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="px-5 pb-8 pt-4">
          <div className="flex items-start justify-between gap-3">
            <h2 className="font-serifar text-2xl leading-tight text-ink">{item.name}</h2>
            <span dir="ltr" className="nums shrink-0 pt-1 font-bold text-accentdeep">
              {item.priceLabel}
            </span>
          </div>

          {item.paused && (
            <span className="mt-2 inline-block rounded-full bg-dark px-2.5 py-1 text-[0.65rem] text-cream">
              {s.unavailable}
            </span>
          )}

          {item.note && (
            <p className="mt-2 text-sm leading-relaxed text-muted">{item.note}</p>
          )}

          {/* القيم — رقمان لا جدول */}
          {(kcalKnown || cafKnown) && (
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {kcalKnown && <Stat value={detail!.kcal} unit={s.kcalUnit} label={s.energy} />}
              {cafKnown && <Stat value={detail!.caffeine} unit={s.mgUnit} label={s.caffeine} />}
            </div>
          )}

          {/* المكوّنات كما في الوصفة */}
          {detail && detail.parts.length > 0 && (
            <div className="mt-5">
              <h3 className="mb-2 text-[0.7rem] font-semibold text-muted">{s.ingredients}</h3>
              <ul className="divide-y divide-line/60 rounded-xl border border-line bg-sand/40">
                {detail.parts.map((p) => (
                  <li key={p.name} className="flex items-baseline justify-between gap-3 px-3 py-2">
                    <span className="text-sm text-ink">{p.name}</span>
                    <span dir="ltr" className="nums shrink-0 text-xs text-muted">
                      {p.qty} {s.units[p.unit] ?? p.unit}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/*
            **لا خيارات في منيو الزبون.** قال المالك: المشروبات
            الكلاسيكية نختارها ونخصّصها في الخلف، والخيارات تأتي لاحقاً
            في المشروبات المخصّصة وحدها. وعرض ثلاثة أنواع بنٍّ يُفهم
            دعوةً للاختيار ولو لم تُكتب كلمة «اختر» — فالزبون يطلب ما
            رآه معروضاً.

            فالبنّ يُذكر حين يكون واحداً: حينها هو **ما يُقدَّم** لا
            قائمةٌ تُنتقى. وحكايته تبقى، فهي ما يُقرأ في مقهىً مختصّ.
          */}
          {detail && detail.kinds.length === 1 && (
            <div className="mt-5">
              <h3 className="mb-2 text-[0.7rem] font-semibold text-muted">{s.bean}</h3>
              <div className="rounded-xl bg-sand/60 px-3 py-2">
                {/* بلا `kindName`: ما يصل هنا هو الاسم المعروض الذي
                    كتبه المالك، لا اسم المخزن — فلا شيء يُقتطع منه. */}
                <p className="text-sm font-medium text-ink">{detail.kinds[0].name}</p>
                {detail.kinds[0].note && (
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">
                    {detail.kinds[0].note}
                  </p>
                )}
              </div>
            </div>
          )}

          {(kcalKnown || cafKnown) && (
            <p className="mt-4 text-[0.7rem] leading-relaxed text-muted/80">
              {s.approx}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ value, unit, label }: { value: number; unit: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-sand/40 px-3 py-2.5 text-center">
      <p className="nums text-lg font-bold leading-none text-ink">
        <span className="text-[0.7rem] font-normal text-muted">≈ </span>
        {value}
        <span className="ms-1 text-[0.7rem] font-normal text-muted">{unit}</span>
      </p>
      <p className="mt-1 text-[0.68rem] text-muted">{label}</p>
    </div>
  );
}
