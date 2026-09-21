"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import DrinkArt, { artKind } from "./DrinkArt";
import MenuSheet, { type SheetDetail } from "./MenuSheet";
import type { Strings } from "@/lib/menu-strings";

export type BoardItem = {
  id: string;
  name: string;
  category: string;
  note: string | null;
  imageUrl: string | null;
  paused: boolean;
  special: boolean;
  kind: "drink" | "retail";
  priceLabel: string;
  kinds: string[];
};

export type BoardGroup = { key: string; label: string; items: BoardItem[] };

/**
 * لوح المنيو.
 *
 * مقروءٌ على هاتفٍ بيدٍ واحدة، في ضوءٍ خافت، في عشر ثوانٍ. فكل قرارٍ
 * هنا خادمٌ لذلك: صفّان لا صفّ — لأن القائمة الطويلة تُمرَّر ولا
 * تُقرأ؛ وشريط أقسامٍ لاصق — لأن من يريد «بارد» لا يجب أن يمرّ على
 * كل ساخن؛ والمميّز بعرض الشاشة — لأن ما يُباع بضعف الثمن يجب أن
 * يُرى أوّلاً.
 */
export default function MenuBoard({
  groups,
  details,
  s,
}: {
  groups: BoardGroup[];
  details: Record<string, SheetDetail>;
  /** كلمات الصفحة بلغتها. تُمرَّر من الخادم فتعمل اللغتان بلا حالة عميل. */
  s: Strings;
}) {
  const [active, setActive] = useState(groups[0]?.key ?? "");
  const [open, setOpen] = useState<BoardItem | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // القسم الفعّال يُشتقّ من موضع القراءة، لا من آخر ضغطة: من يمرّر
  // بإصبعه لم يضغط شيئاً، والشريط يجب أن يعرف أين هو.
  useEffect(() => {
    const seen = new Map<string, number>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          const k = e.target.getAttribute("data-sec");
          if (k) seen.set(k, e.intersectionRatio);
        }
        let best = "";
        let top = 0;
        for (const [k, r] of seen) if (r > top) [best, top] = [k, r];
        if (best) setActive(best);
      },
      { rootMargin: "-88px 0px -55% 0px", threshold: [0, 0.2, 0.6, 1] }
    );
    document.querySelectorAll("[data-sec]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [groups.length]);

  // الشريط يتبع القسم الفعّال أفقياً، وإلّا خرج «مختص» عن الشاشة
  // بينما القارئ فيه
  useEffect(() => {
    const el = navRef.current?.querySelector<HTMLElement>(`[data-chip="${active}"]`);
    el?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [active]);

  return (
    <>
      <div className="sticky top-0 z-30 -mx-5 mb-8 px-5 pb-2 pt-3">
        <div
          ref={navRef}
          className="no-scrollbar mx-auto flex w-full gap-1.5 overflow-x-auto rounded-full border border-ink/[0.07] bg-cream/85 p-1.5 shadow-soft backdrop-blur-xl sm:w-max"
        >
          {groups.map((g) => (
            <a
              key={g.key}
              href={`#${g.key}`}
              data-chip={g.key}
              className={`shrink-0 rounded-full px-4 py-2 font-display text-[0.8rem] font-semibold transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                active === g.key
                  ? "bg-dark text-cream"
                  : "text-muted hover:text-ink"
              }`}
            >
              {g.label}
            </a>
          ))}
        </div>
      </div>

      <div className="space-y-12">
        {groups.map((g) => (
          <section key={g.key} id={g.key} data-sec={g.key} className="scroll-mt-24">
            <div className="mb-5 flex items-baseline gap-3">
              <h2 className="font-serifar text-[1.75rem] leading-none text-ink">{g.label}</h2>
              <span className="h-px flex-1 bg-ink/10" />
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {g.items.map((it, i) =>
                it.special ? (
                  <Hero key={it.id} item={it} index={i} s={s} onOpen={() => setOpen(it)} />
                ) : (
                  <Tile key={it.id} item={it} index={i} s={s} onOpen={() => setOpen(it)} />
                )
              )}
            </div>
          </section>
        ))}
      </div>

      {open && (
        <MenuSheet item={open} detail={details[open.id]} s={s} onClose={() => setOpen(null)} />
      )}
    </>
  );
}

/**
 * ظهورٌ بالتدرّج عند الوصول.
 *
 * **يبدأ ظاهراً.** الحركة زينة، والمنيو طعام: لو تعطّلت جافاسكربت أو
 * تأخّرت على شبكةٍ بطيئة، بقيت الصفحة مقروءة كاملةً بدل أن يرى الزبون
 * أقساماً فارغة. فالإخفاء يقع في المتصفّح وحده، قبل أوّل رسم
 * (`useLayoutEffect`) فلا وميض، ولمن طلب تقليل الحركة لا يقع أصلاً.
 */
const useIsoLayout = typeof window === "undefined" ? useEffect : useLayoutEffect;

function useReveal<T extends HTMLElement>(delayMs: number) {
  const ref = useRef<T>(null);
  const [on, setOn] = useState(true);

  useIsoLayout(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // ما هو في الشاشة أصلاً لا يُخفى ثم يُظهَر — ذاك وميضٌ لا ظهور
    const box = el.getBoundingClientRect();
    if (box.top < window.innerHeight * 0.92) return;

    setOn(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          setTimeout(() => setOn(true), delayMs);
        }
      },
      { rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delayMs]);

  return { ref, on };
}

const REVEAL =
  "transition-[opacity,transform] duration-[900ms] ease-[cubic-bezier(0.22,0.68,0,1)] motion-reduce:transition-none";

function Art({ item, className }: { item: BoardItem; className: string }) {
  if (item.imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.imageUrl}
        alt=""
        loading="lazy"
        decoding="async"
        className={`${className} object-cover`}
      />
    );
  }
  return <DrinkArt name={item.name} kind={artKind(item.category, item.kind)} className={className} />;
}

/** بطاقةٌ داخل صدفة: إطارٌ خارجيّ رفيع وقلبٌ كريميّ، كصفيحةٍ في درج. */
function Tile({
  item,
  index,
  s,
  onOpen,
}: {
  item: BoardItem;
  index: number;
  s: Strings;
  onOpen: () => void;
}) {
  const { ref, on } = useReveal<HTMLButtonElement>(Math.min(index, 6) * 55);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={`${item.name} — التفاصيل`}
      className={`${REVEAL} tap block w-full text-start rounded-[1.6rem] bg-ink/[0.045] p-1.5 ring-1 ring-ink/[0.06] ${
        on ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
    >
      {/*
        الموقوف يُهدَّأ ولا يُمحى: الشفافية على البطاقة كلّها تُخفي اسمه
        وسعره أيضاً، فيبدو خللاً في الرسم لا حالةً مقصودة. فالرماديّ على
        الصورة وحدها، والنصّ يبقى مقروءاً كما هو.
      */}
      <div
        className="flex h-full flex-col overflow-hidden rounded-[1.225rem] bg-cream"
        style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.7)" }}
      >
        <div className="relative">
          <Art
            item={item}
            className={`aspect-square w-full ${item.paused ? "opacity-60 grayscale" : ""}`}
          />
          {item.paused && (
            <span className="absolute bottom-2 right-2 rounded-full bg-dark px-2.5 py-1 text-[0.62rem] font-medium text-cream">
              {s.unavailable}
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col px-3 pb-3 pt-2.5">
          <h3 className="font-display text-[0.92rem] font-semibold leading-snug text-ink">
            {item.name}
          </h3>
          {item.note && (
            <p className="mt-1 line-clamp-2 text-[0.72rem] leading-relaxed text-muted">
              {item.note}
            </p>
          )}
          {/* نوعٌ واحد = ما يُقدَّم. وعدّة أنواعٍ تُخفى: سردُها في المنيو
              يُقرأ خياراً، والاختيار يقع في الخلف لا عند الزبون. */}
          {item.kinds.length === 1 && (
            <p className="mt-1.5 text-[0.68rem] leading-relaxed text-accentdeep">
              {item.kinds[0]}
            </p>
          )}
          <p
            dir="ltr"
            className="nums mt-auto pt-2.5 text-end text-[0.82rem] font-bold tracking-tight text-accentdeep"
          >
            {item.priceLabel}
          </p>
        </div>
      </div>
    </button>
  );
}

/** المميّز: بعرض الصفّ، صورةٌ إلى جانب النصّ لا فوقه. */
function Hero({
  item,
  index,
  s,
  onOpen,
}: {
  item: BoardItem;
  index: number;
  s: Strings;
  onOpen: () => void;
}) {
  const { ref, on } = useReveal<HTMLButtonElement>(Math.min(index, 6) * 55);

  return (
    <button
      ref={ref}
      type="button"
      onClick={onOpen}
      aria-label={`${item.name} — التفاصيل`}
      className={`${REVEAL} tap col-span-2 block w-full text-start rounded-[1.6rem] bg-dark p-1.5 ring-1 ring-ink/10 sm:col-span-3 lg:col-span-4 ${
        on ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
    >
      <div
        className={`flex overflow-hidden rounded-[1.225rem] bg-darker ${
          item.paused ? "opacity-60" : ""
        }`}
      >
        <Art
          item={item}
          className={`aspect-square w-[34%] max-w-[200px] shrink-0 sm:w-[30%] ${
            item.paused ? "opacity-60 grayscale" : ""
          }`}
        />
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-4 py-4 sm:px-6">
          <span className="w-fit rounded-full bg-accent/20 px-2.5 py-0.5 text-[0.62rem] font-semibold text-accent">
            {s.special}
          </span>
          <h3 className="font-serifar text-xl leading-tight text-cream sm:text-2xl">{item.name}</h3>
          {item.note && (
            <p className="line-clamp-2 text-[0.78rem] leading-relaxed text-cream/60">{item.note}</p>
          )}
          {item.kinds.length === 1 && (
            <p className="text-[0.7rem] text-accent/80">{item.kinds[0]}</p>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span dir="ltr" className="nums text-base font-bold tracking-tight text-cream">
              {item.priceLabel}
            </span>
            {item.paused && (
              <span className="rounded-full bg-cream/10 px-2 py-0.5 text-[0.6rem] text-cream/70">
                {s.unavailable}
              </span>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
