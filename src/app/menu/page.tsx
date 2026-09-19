import type { Viewport } from "next";
import { publicMenu, soleBusinessId, type MenuItem } from "@/lib/menu";
import { getSettings, strSetting } from "@/lib/settings";
import { money, num, categoryLabel, kindName } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "منيو خزف",
  description: "قائمة مشروبات مقهى خزف",
};

/**
 * الزبون يقرأ، والكاشير يعمل.
 *
 * التخطيط العام يمنع التكبير — وهذا صوابٌ في كاشير يُلمس بالإبهام وسط
 * الخدمة، وخطأٌ في منيو يقرأه زبونٌ قد يكون ضعيف البصر. فهذه الصفحة
 * تستعيد التكبير لنفسها وحدها.
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
  const drinks = items.filter((i) => i.kind === "drink");
  const goods = items.filter((i) => i.kind === "retail");

  const groups = ORDER.map((c) => ({
    key: c,
    label: categoryLabel(c),
    items: drinks.filter((d) => d.category === c),
  })).filter((g) => g.items.length > 0);

  // فئةٌ لم تخطر في `ORDER` تبقى معروضة: منيو يُسقط مشروباً بصمت أسوأ
  // من منيو بترتيبٍ غير مثالي
  const rest = drinks.filter((d) => !ORDER.includes(d.category));
  if (rest.length > 0) groups.push({ key: "rest", label: "أخرى", items: rest });

  return (
    <main className="min-h-screen pb-16">
      <header className="topbar px-6 pb-10 pt-12 text-center">
        <div className="font-display text-5xl font-bold tracking-tight text-cream">خزف</div>
        <div className="mt-1 text-sm tracking-[0.35em] text-cream/60">C A F É</div>
        <p className="mt-4 text-xs text-cream/50">المنيو</p>
      </header>

      <div className="mx-auto -mt-4 w-full max-w-lg px-5">
        {items.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-sm text-muted">المنيو قيد التحضير.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((g) => (
              <section key={g.key} className="card p-5">
                <h2 className="mb-1 font-display text-lg font-bold text-ink">{g.label}</h2>
                <div className="divide-y divide-line/60">
                  {g.items.map((i) => (
                    <Row key={i.id} item={i} currency={currency} />
                  ))}
                </div>
              </section>
            ))}

            {goods.length > 0 && (
              <section className="card p-5">
                <h2 className="mb-1 font-display text-lg font-bold text-ink">للبيت</h2>
                <p className="mb-1 text-xs text-muted">
                  حبّات البنّ نفسها التي تُحضَّر منها مشروباتنا.
                </p>
                <div className="divide-y divide-line/60">
                  {goods.map((i) => (
                    <Row key={i.id} item={i} currency={currency} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}

        <footer className="mt-8 text-center">
          <p className="text-sm font-medium text-ink">{shop}</p>
          {phone && (
            <p className="nums mt-1 text-xs text-muted" dir="ltr">
              {phone}
            </p>
          )}
          {/* بلا ذكر العتبة: المالك يغيّرها من الإعدادات، ورقمٌ مكتوبٌ هنا
              يصير كذبةً في اليوم الذي يغيّرها فيه. الصفحة نفسها تقولها. */}
          <a href="/loyalty" className="btn-ghost mt-4 inline-block px-5 py-2.5 text-sm">
            انضمّ لنادي خزف ←
          </a>
        </footer>
      </div>
    </main>
  );
}

function Row({ item, currency }: { item: MenuItem; currency: string }) {
  // أنواع البنّ ميزةٌ تُقال في مقهى مختصّ. لكن نوعاً واحداً ليس اختياراً
  // يُعرض على الزبون — هو ببساطة ما يُقدَّم، فلا يُزاحم الاسم.
  const kinds = item.variants.map(kindName).filter((v, n, a) => a.indexOf(v) === n);
  // المدى بعملةٍ واحدة في آخره: «٢٬٠٠٠ IQD — ٤٬٠٠٠ IQD» وسط نصٍّ عربي
  // يقلبه المتصفّح فيُقرأ «IQD — 4,000 IQD 2,000». رقمان وعملةٌ واحدة
  // داخل `dir="ltr"` يُقرآن كما كُتبا.
  const price =
    item.minPrice === item.maxPrice
      ? money(item.minPrice, currency)
      : `${num(item.minPrice)} — ${money(item.maxPrice, currency)}`;

  return (
    <div className={`flex items-start gap-3 py-3 ${item.paused ? "opacity-45" : ""}`}>
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-xl object-cover"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-ink">{item.name}</span>
          {item.paused && (
            <span className="rounded-full bg-sand px-2 py-0.5 text-[0.65rem] text-muted">
              غير متوفّر اليوم
            </span>
          )}
        </div>
        {item.note && <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.note}</p>}
        {kinds.length > 1 && (
          <p className="mt-1 text-xs text-accentdeep">{kinds.join(" · ")}</p>
        )}
      </div>
      <span dir="ltr" className="nums shrink-0 pt-0.5 text-sm font-semibold text-ink">
        {price}
      </span>
    </div>
  );
}
