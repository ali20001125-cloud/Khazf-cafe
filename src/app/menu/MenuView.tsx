import { menuDetails, publicMenu, soleBusinessId, type Lang } from "@/lib/menu";
import { strings } from "@/lib/menu-strings";
import { getSettings, strSetting } from "@/lib/settings";
import { bannerLive, readBanner } from "@/lib/banner";
import Link from "next/link";
import { money, num, categoryLabel } from "@/lib/format";
import MenuBoard, { type BoardGroup, type BoardItem } from "@/components/MenuBoard";
import FeedbackSheet from "@/components/FeedbackSheet";

const ORDER = ["espresso", "hot", "cold", "filter", "other"];

/**
 * المنيو — بلغتين.
 *
 * **مسارٌ لكل لغة** (`/menu` و`/menu/en`) لا مفتاحٌ في حالة المتصفّح:
 * الصفحة خادمية، ورابطُ اللغة يُرسَل ويُحفَظ ويُطبَع على الرمز. ولو
 * كانت الحالة في العميل لعاد كل من فتح الرابط إلى العربية.
 */
export default async function MenuView({ lang }: { lang: Lang }) {
  const s = strings(lang);
  const bid = await soleBusinessId();
  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");
  const currency = strSetting(settings, "currency", "د.ع");
  const phone = strSetting(settings, "shop_phone", "");

  // الشريط ينتهي وحده: لا مهمّة مجدولة تُسكته، بل القراءة نفسها لا
  // تُظهره بعد يومه. (انظر `lib/banner.ts`)
  const raw = readBanner(settings as Record<string, unknown>);
  const banner = bannerLive(raw, new Date()) ? raw : null;

  const [items, details] = bid
    ? await Promise.all([publicMenu(bid, lang), menuDetails(bid, lang)])
    : [[], {}];

  const toBoard = (i: (typeof items)[number]): BoardItem => ({
    id: i.id,
    name: i.name,
    category: i.category,
    note: i.note,
    imageUrl: i.imageUrl,
    paused: i.paused,
    special: i.special,
    kind: i.kind,
    // العملة مرّةً واحدة في آخر المدى، والرقمان داخل `dir="ltr"`: وسط
    // نصٍّ عربي يقلب المتصفّح «٢٬٠٠٠ د.ع — ٤٬٠٠٠ د.ع» فتُقرأ معكوسة
    priceLabel:
      i.minPrice === i.maxPrice
        ? money(i.minPrice, currency)
        : `${num(i.minPrice)} — ${money(i.maxPrice, currency)}`,
    // بلا `kindName`: ما يأتي من `public_menu` هو الاسم المعروض الذي
    // كتبه المالك، لا اسم المخزن — فلا «حبوب» تُقتطع ولا «— للبيع».
    kinds: i.variants.filter((v, n, a) => a.indexOf(v) === n),
  });

  // المميّز يتصدّر قسمه. بطاقةٌ بعرض الشاشة في ذيل القسم تُرى بعد أن
  // يكون القارئ قد اختار — فتُضيَّع، وهي أغلى ما يُباع.
  const lead = <T extends { special: boolean }>(a: T[]) =>
    [...a].sort((x, y) => Number(y.special) - Number(x.special));

  const drinks = items.filter((i) => i.kind === "drink");
  const goods = lead(items.filter((i) => i.kind === "retail"));

  const groups: BoardGroup[] = ORDER.map((c) => ({
    key: c,
    label: s.sections[c] ?? categoryLabel(c),
    items: lead(drinks.filter((d) => d.category === c)).map(toBoard),
  })).filter((g) => g.items.length > 0);

  // فئةٌ لم تخطر في `ORDER` تبقى معروضة: منيو يُسقط مشروباً بصمت أسوأ
  // من منيو بترتيبٍ غير مثالي
  const rest = drinks.filter((d) => !ORDER.includes(d.category));
  if (rest.length > 0)
    groups.push({ key: "rest", label: s.sections.rest, items: lead(rest).map(toBoard) });

  if (goods.length > 0)
    groups.push({ key: "home", label: s.sections.home, items: goods.map(toBoard) });

  // ملاحظة على `<main>` أدناه: بلا `overflow-x-hidden`.
  // `overflow-x: hidden` يجعل `overflow-y` يُحسب `auto`، فيصير العنصر
  // حاوية تمرير ارتفاعها ارتفاع محتواها — حاويةٌ لا شيء فيها ليُمرَّر.
  // فالإصبع على الهاتف يمسك بها ولا يصل التمرير إلى الصفحة خلفها: تعمل
  // عجلة الفأرة ولا يعمل اللمس. والوهج خلف الاسم يقصّه الترويس نفسه،
  // فلا فائض أفقيّ أصلاً ليُخفى.
  return (
    <main dir={lang === "en" ? "ltr" : "rtl"} lang={lang} className="relative min-h-screen bg-sand">
      {/* حبيباتٌ ثابتة فوق كل شيء: تعطي الورق ملمساً وتمنع أن تبدو
          المساحات الدافئة الكبيرة مسطّحةً على شاشةٍ رخيصة */}
      <div className="grain" aria-hidden="true" />

      <header className="relative overflow-hidden bg-dark px-6 pb-16 pt-14 text-center">
        <div className="hero-glow" aria-hidden="true" />

        {/*
          زرّ اللغة في الترويس لا في الذيل: من لا يقرأ العربية لا يمرّر
          منيواً كاملاً ليجد مخرجه — يراه في أوّل شاشة أو يغلق.
        */}
        <Link
          href={s.otherHref}
          hrefLang={lang === "en" ? "ar" : "en"}
          className="absolute end-5 top-5 z-10 rounded-full border border-cream/25 px-3.5 py-1.5 text-[0.7rem] font-medium text-cream/80 transition-colors hover:bg-cream/10"
        >
          {s.other}
        </Link>
        <div className="relative">
          <div className="font-serifar text-[3.5rem] leading-[0.95] text-cream">خزف</div>
          <div className="mt-2 text-[0.7rem] tracking-[0.45em] text-cream/40">C A F É</div>
          <div className="mx-auto mt-6 h-px w-14 bg-cream/20" />
          {/* بلا تباعد حروف: العربية متّصلة، و`tracking` يفكّ وصلها
              فتُقرأ «ا ل م ن ي و». التباعد للاتيني وحده. */}
          <p className="mt-5 text-[0.72rem] text-cream/45">{s.menu}</p>
        </div>
      </header>

      {banner && (
        <div className="relative mx-auto -mt-9 w-full max-w-4xl px-5">
          <div
            className={`rounded-2xl px-5 py-3 text-center text-sm font-medium shadow-soft ${
              banner.tone === "warn"
                ? "bg-amber-100 text-amber-900"
                : "bg-cream text-ink ring-1 ring-ink/10"
            }`}
          >
            {banner.text}
          </div>
        </div>
      )}

      <div className="relative mx-auto w-full max-w-4xl px-5 pb-20">
        {groups.length === 0 ? (
          <div className="mt-14 rounded-[1.6rem] bg-ink/[0.045] p-1.5 ring-1 ring-ink/[0.06]">
            <div className="rounded-[1.225rem] bg-cream px-6 py-14 text-center">
              <p className="font-serifar text-xl text-ink">{s.soon}</p>
              <p className="mt-2 text-sm text-muted">{s.soonNote}</p>
            </div>
          </div>
        ) : (
          <MenuBoard groups={groups} details={details} s={s} />
        )}

        <footer className="mt-16 text-center">
          <div className="mx-auto h-px w-14 bg-ink/10" />
          <p className="mt-6 font-serifar text-lg text-ink">{shop}</p>
          {phone && (
            <p className="nums mt-1 text-xs tracking-wide text-muted" dir="ltr">
              {phone}
            </p>
          )}

          {/* الزرّ داخله زرّ: السهم في دائرته لا عارياً بجانب النصّ */}
          <a
            href="/loyalty"
            className="group mt-7 inline-flex items-center gap-3 rounded-full bg-dark py-2 text-cream ltr:pl-6 ltr:pr-2 rtl:pl-2 rtl:pr-6 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
          >
            <span className="text-sm font-semibold">{s.join}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105 ltr:group-hover:translate-x-1 rtl:group-hover:-translate-x-1">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {lang === "en" ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M19 12H5M11 18l-6-6 6-6" />}
              </svg>
            </span>
          </a>

          {/*
            الرأي تحت زرّ الولاء لا فوقه: من وصل إلى هنا قرأ المنيو،
            والدعوة إلى الانضمام أثمن من الدعوة إلى النقد.
          */}
          <div>
            <FeedbackSheet
              items={items.filter((i) => i.kind === "drink").map((i) => ({ id: i.id, name: i.name }))}
              s={s}
              lang={lang}
            />
          </div>
        </footer>
      </div>
    </main>
  );
}
