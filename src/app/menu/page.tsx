import type { Viewport } from "next";
import { publicMenu, soleBusinessId } from "@/lib/menu";
import { getSettings, strSetting } from "@/lib/settings";
import { money, num, categoryLabel, kindName } from "@/lib/format";
import MenuBoard, { type BoardGroup, type BoardItem } from "@/components/MenuBoard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "منيو خزف",
  description: "قائمة مشروبات مقهى خزف",
};

/**
 * التخطيط العام يمنع التكبير — صوابٌ في كاشير يُلمس بالإبهام وسط
 * الخدمة، وخطأٌ في منيو يقرأه زبونٌ قد يكون ضعيف البصر. فهذه الصفحة
 * تستعيده لنفسها وحدها.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
  themeColor: "#1C1A18",
};

const ORDER = ["espresso", "hot", "cold", "filter", "other"];

export default async function MenuPage() {
  const bid = await soleBusinessId();
  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");
  const currency = strSetting(settings, "currency", "د.ع");
  const phone = strSetting(settings, "shop_phone", "");

  const items = bid ? await publicMenu(bid) : [];

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
    kinds: i.variants.map(kindName).filter((v, n, a) => a.indexOf(v) === n),
  });

  // المميّز يتصدّر قسمه. بطاقةٌ بعرض الشاشة في ذيل القسم تُرى بعد أن
  // يكون القارئ قد اختار — فتُضيَّع، وهي أغلى ما يُباع.
  const lead = <T extends { special: boolean }>(a: T[]) =>
    [...a].sort((x, y) => Number(y.special) - Number(x.special));

  const drinks = items.filter((i) => i.kind === "drink");
  const goods = lead(items.filter((i) => i.kind === "retail"));

  const groups: BoardGroup[] = ORDER.map((c) => ({
    key: c,
    label: categoryLabel(c),
    items: lead(drinks.filter((d) => d.category === c)).map(toBoard),
  })).filter((g) => g.items.length > 0);

  // فئةٌ لم تخطر في `ORDER` تبقى معروضة: منيو يُسقط مشروباً بصمت أسوأ
  // من منيو بترتيبٍ غير مثالي
  const rest = drinks.filter((d) => !ORDER.includes(d.category));
  if (rest.length > 0)
    groups.push({ key: "rest", label: "أخرى", items: lead(rest).map(toBoard) });

  if (goods.length > 0)
    groups.push({ key: "home", label: "للبيت", items: goods.map(toBoard) });

  // ملاحظة على `<main>` أدناه: بلا `overflow-x-hidden`.
  // `overflow-x: hidden` يجعل `overflow-y` يُحسب `auto`، فيصير العنصر
  // حاوية تمرير ارتفاعها ارتفاع محتواها — حاويةٌ لا شيء فيها ليُمرَّر.
  // فالإصبع على الهاتف يمسك بها ولا يصل التمرير إلى الصفحة خلفها: تعمل
  // عجلة الفأرة ولا يعمل اللمس. والوهج خلف الاسم يقصّه الترويس نفسه،
  // فلا فائض أفقيّ أصلاً ليُخفى.
  return (
    <main className="relative min-h-screen bg-sand">
      {/* حبيباتٌ ثابتة فوق كل شيء: تعطي الورق ملمساً وتمنع أن تبدو
          المساحات الدافئة الكبيرة مسطّحةً على شاشةٍ رخيصة */}
      <div className="grain" aria-hidden="true" />

      <header className="relative overflow-hidden bg-dark px-6 pb-16 pt-14 text-center">
        <div className="hero-glow" aria-hidden="true" />
        <div className="relative">
          <div className="font-serifar text-[3.5rem] leading-[0.95] text-cream">خزف</div>
          <div className="mt-2 text-[0.7rem] tracking-[0.45em] text-cream/40">C A F É</div>
          <div className="mx-auto mt-6 h-px w-14 bg-cream/20" />
          {/* بلا تباعد حروف: العربية متّصلة، و`tracking` يفكّ وصلها
              فتُقرأ «ا ل م ن ي و». التباعد للاتيني وحده. */}
          <p className="mt-5 text-[0.72rem] text-cream/45">المنيو</p>
        </div>
      </header>

      <div className="relative mx-auto w-full max-w-4xl px-5 pb-20">
        {groups.length === 0 ? (
          <div className="mt-14 rounded-[1.6rem] bg-ink/[0.045] p-1.5 ring-1 ring-ink/[0.06]">
            <div className="rounded-[1.225rem] bg-cream px-6 py-14 text-center">
              <p className="font-serifar text-xl text-ink">المنيو قيد التحضير</p>
              <p className="mt-2 text-sm text-muted">عُد بعد قليل.</p>
            </div>
          </div>
        ) : (
          <MenuBoard groups={groups} />
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
            className="group mt-7 inline-flex items-center gap-3 rounded-full bg-dark py-2 pl-2 pr-6 text-cream transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
          >
            <span className="text-sm font-semibold">انضمّ لنادي خزف</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-cream/10 transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-x-1 group-hover:scale-105">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
            </span>
          </a>
        </footer>
      </div>
    </main>
  );
}
