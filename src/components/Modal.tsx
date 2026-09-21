"use client";

import { useEffect, useRef } from "react";

/**
 * نافذة الإدارة.
 *
 * ورقةٌ تصعد من الأسفل على الهاتف، ومربّعٌ في الوسط على الشاشة الكبيرة.
 *
 * وكانت تظهر دفعةً واحدة بلا حركة: نصفُ الشاشة يتبدّل في إطارٍ واحد،
 * فلا تعرف العين من أين جاء ما جاء. والحركة هنا ليست زينة — هي التي
 * تقول «هذه ورقةٌ فوق ما كنتَ فيه، وستعود» بدل «انتقلتَ إلى مكانٍ آخر».
 * و`motion-safe` تحترم من أوقف الحركات في هاتفه.
 *
 * والإغلاق من ثلاثة أبواب — الخلفية، والزرّ، ومفتاح الهروب — لأن من
 * لا يجد المخرج يترك الشاشة كلّها.
 */
export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);

    // الصفحة خلف النافذة لا تُمرَّر: من يسحب داخل النافذة على الهاتف
    // يجب ألّا يجد نفسه وقد ضاع موضعه في الجدول تحتها
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    panel.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-dark/50 backdrop-blur-sm motion-safe:animate-[fadein_.25s_ease]" />

      <div
        ref={panel}
        tabIndex={-1}
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
        /* `max-h` و`overflow-y-auto`: نافذةٌ أطول من الشاشة كانت تُقصّ
           فيبقى زرّ الحفظ تحت الحافّة بلا طريقٍ إليه. */
        className="relative max-h-[92vh] w-full max-w-sm overflow-y-auto rounded-t-3xl bg-sand p-6 shadow-lift outline-none sm:rounded-3xl motion-safe:animate-[sheetup_.32s_cubic-bezier(0.22,0.68,0,1)]"
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
          {/*
            زرّ الإغلاق في كل نافذة في النظام. كان ٣٢ بكسل — وهو المخرج
            الوحيد لمن فتح نافذةً بالخطأ، فتصغيره يحبس المستخدم فيها.
            والدائرة الملوّنة تبقى ٣٢ ليبقى الشكل، ومساحة اللمس ٤٤.
          */}
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="tap -m-1.5 flex h-11 w-11 items-center justify-center p-1.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dark/5 text-muted">
              ✕
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
