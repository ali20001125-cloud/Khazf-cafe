import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { loadPrintData } from "@/lib/print-data";
import type { PrintItem } from "@/lib/print-menu";
import PrintButton from "@/components/PrintButton";
import SiteWarning from "@/components/SiteWarning";

export const dynamic = "force-dynamic";
export const metadata = { title: "منيو خزف — للطباعة" };

/**
 * المنيو الورقي «خزف» — من الهويّة البصرية لا من منيو مقهىً آخر.
 *
 * قال المالك: ألوانٌ أخرى، نقوش، ترتيبٌ وأشكالٌ أخرى — خذها من ملف
 * الهويّة. والاسم نفسه هو النقش: **خزف** فخّارٌ على دولاب. فالعناصر
 * منه:
 * - **حلقات الدولاب** — دوائر متّحدة المركز في الزوايا، خافتةً كأثر
 *   الأصابع على الطين.
 * - **القوس** — شكل فوّهة الجرّة: الرأس قوسٌ داكن، وكل قسمٍ بطاقةٌ
 *   بأعلى مقوّس.
 * - **الزخرفة المسنّنة** — حزام المثلّثات على أكتاف الجرار القديمة،
 *   فاصلاً فوق الإضافات وفي الذيل.
 *
 * وثلاث درجات من ألوان الهويّة نفسها (`?tone=`): **طين** (الأصل: بيج
 * ٧٠٪ وداكن ٢٠٪ وطينيّ ١٠٪)، **ليل** (داكنٌ كامل بذهبيّ الدورادو)،
 * **رمل** (بيجٌ بديل ببنّيّ السيرادو). لا أخضر — الهويّة تمنعه.
 */

const TONES = {
  clay: {
    label: "طين",
    paper: "#F4F1EA", alt: "#EDE9DF", ink: "#1A1A1A", muted: "#6B6B6B",
    dark: "#1C1A18", onDark: "#FAF7F0", accent: "#A66A4C", accent2: "#B07A3F", line: "#E0DBD0",
    pill: "#1C1A18", pillInk: "#FAF7F0",
  },
  night: {
    label: "ليل",
    paper: "#1C1A18", alt: "#25221E", ink: "#FAF7F0", muted: "#A39C90",
    dark: "#141311", onDark: "#FAF7F0", accent: "#B07A3F", accent2: "#A66A4C", line: "#38332D",
    // السعر ذهبيٌّ على الليل: كبسولةٌ داكنة على بطاقةٍ داكنة لا تُرى
    pill: "#B07A3F", pillInk: "#141311",
  },
  sand: {
    label: "رمل",
    paper: "#EDE9DF", alt: "#F4F1EA", ink: "#1A1A1A", muted: "#6B6B6B",
    dark: "#8A6B4E", onDark: "#FAF7F0", accent: "#A66A4C", accent2: "#1C1A18", line: "#DCD5C7",
    pill: "#8A6B4E", pillInk: "#FAF7F0",
  },
} as const;
type Tone = keyof typeof TONES;

const SECTIONS: { key: string; ar: string; en: string; icon: keyof typeof ICONS }[] = [
  { key: "espresso", ar: "إسبريسو", en: "Espresso", icon: "espresso" },
  { key: "hot", ar: "ساخن", en: "Hot", icon: "hot" },
  { key: "cold", ar: "بارد", en: "Iced", icon: "cold" },
  { key: "filter", ar: "مختص", en: "Filter", icon: "filter" },
  { key: "other", ar: "أخرى", en: "Other", icon: "other" },
];

/** رسومٌ خطّية بقلمٍ واحد — أيقونة كل قسم في دائرةٍ فوق قوسه. */
const ICONS = {
  espresso: "M6 9h10v3.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5zM16 10.5h1.5a2 2 0 0 1 0 4H16M4.5 20h13",
  hot: "M5 10h11v3a5.5 5.5 0 0 1-5.5 5.5A5.5 5.5 0 0 1 5 13zM16 11h1.5a2 2 0 0 1 0 4H16M8 3.5c-1 1.2 1 2 0 3.5M11 3.5c-1 1.2 1 2 0 3.5",
  cold: "M6.5 4h11l-1.6 16h-7.8zM9 9.5h3v3H9zM12.5 12.5h2.5V15h-2.5zM14 3l-1.5 6",
  filter: "M4 6h16l-5.5 7.5h-5zM9.5 13.5v2.5h5v-2.5M7 20h10M12 3v1.5",
  other: "M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10z",
} as const;

const n = (v: number) => v.toLocaleString("en-US");
const price = (i: PrintItem) =>
  i.minPrice === i.maxPrice ? n(i.minPrice) : `${n(i.minPrice)}–${n(i.maxPrice)}`;

/** حلقات الدولاب: دوائر متّحدة المركز. */
function Rings({ className }: { className: string }) {
  return (
    <svg className={className} viewBox="0 0 300 300" aria-hidden="true">
      {Array.from({ length: 11 }, (_, i) => (
        <circle key={i} cx="150" cy="150" r={22 + i * 12} fill="none" strokeWidth={i % 3 === 0 ? 1.4 : 0.7} />
      ))}
    </svg>
  );
}

/** الحزام المسنّن — مثلّثاتٌ متتالية كأكتاف الجرار. */
function Zigzag({ className }: { className: string }) {
  return (
    <svg className={className} preserveAspectRatio="none" viewBox="0 0 200 8" aria-hidden="true">
      <path
        d={Array.from({ length: 25 }, (_, i) => `${i === 0 ? "M" : "L"}${i * 8} 7 L${i * 8 + 4} 1`).join(" ") + " L200 7"}
        fill="none"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export default async function CeramicPrintMenu({ searchParams }: { searchParams: { tone?: string } }) {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "products.manage"))) redirect("/");

  const tone: Tone = searchParams.tone && searchParams.tone in TONES ? (searchParams.tone as Tone) : "clay";
  const t = TONES[tone];
  const d = await loadPrintData(user.bid);

  const known = new Set(SECTIONS.map((s) => s.key));
  const groups = SECTIONS.map((s) => ({
    ...s,
    items: d.items.filter((i) =>
      s.key === "other" ? i.category === "other" || !known.has(i.category) : i.category === s.key
    ),
  })).filter((g) => g.items.length > 0);

  // قسمٌ من صنفٍ أو صنفين (الماء) لا يستحقّ بطاقةً بقوسٍ وأيقونة تأكل
  // ربع عمود: يُكتب سطراً تحت الإضافات
  const small = groups.filter((g) => g.key === "other" && g.items.length <= 2);
  const cards = groups.filter((g) => !small.includes(g));

  // عمودان متوازنان بعدد الصفوف لا بعدد الأقسام: قسمٌ كاملٌ في عمودٍ واحد
  const cols: (typeof cards)[] = [[], []];
  const weight = [0, 0];
  for (const g of cards) {
    const c = weight[0] <= weight[1] ? 0 : 1;
    cols[c].push(g);
    weight[c] += g.items.length + 2;
  }

  const vars = `--paper:${t.paper};--alt:${t.alt};--ink:${t.ink};--muted:${t.muted};--dark:${t.dark};--on-dark:${t.onDark};--accent:${t.accent};--accent2:${t.accent2};--line:${t.line};--pill:${t.pill};--pill-ink:${t.pillInk};`;

  return (
    <div className="km-page">
      <style dangerouslySetInnerHTML={{ __html: `.km-sheet{${vars}}` + CSS }} />

      <div className="km-bar">
        <Link href="/print/menu" className="km-link">→ التصاميم الأخرى</Link>
        <div className="km-tones">
          {(Object.keys(TONES) as Tone[]).map((k) => (
            <Link
              key={k}
              href={`/print/menu/ceramic?tone=${k}`}
              className={`km-tone ${k === tone ? "on" : ""}`}
            >
              <span className="km-dot" style={{ background: TONES[k].dark }} />
              {TONES[k].label}
            </Link>
          ))}
        </div>
        <PrintButton label="اطبع / احفظ PDF" />
      </div>
      <p className="km-tip">A4 · بلا هوامش · فعّل «رسومات الخلفية».</p>
      {!d.siteConfigured && (
        <div className="km-warn">
          <SiteWarning />
        </div>
      )}

      <article className="km-sheet" dir="rtl">
        <Rings className="km-rings km-rings-a" />
        <Rings className="km-rings km-rings-b" />

        <header className="km-head">
          <div className="km-side km-side-r">
            <Zigzag className="km-zz" />
            <span>{d.story}</span>
          </div>
          <div className="km-arch">
            <div className="km-logo">خزف</div>
            <div className="km-cafe">C A F É</div>
          </div>
          <div className="km-side km-side-l" dir="ltr">
            <Zigzag className="km-zz" />
            <span>SPECIALTY COFFEE</span>
          </div>
        </header>

        <main className="km-cols">
          {cols.map((col, ci) => (
            <div key={ci} className="km-col">
              {col.map((g) => (
                <section key={g.key} className="km-card">
                  <div className="km-icon">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d={ICONS[g.icon]} />
                    </svg>
                  </div>
                  <h2 className="km-title">
                    {g.ar}
                    <span dir="ltr">{g.en}</span>
                  </h2>
                  <ul>
                    {g.items.map((i) => (
                      <li key={i.id} className="km-item">
                        <div className="km-names">
                          <div className="km-ar">
                            {i.name}
                            {i.special && <span className="km-star">✦ مميّز</span>}
                          </div>
                          {i.nameEn && <div className="km-en" dir="ltr">{i.nameEn}</div>}
                        </div>
                        <span className="km-price" dir="ltr">{price(i)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          ))}
        </main>

        {d.addons.length > 0 && (
          <section className="km-addons">
            <Zigzag className="km-zz km-zz-wide" />
            <h2 className="km-addons-h">أضِف إلى مشروبك</h2>
            <div className="km-badges">
              {d.addons.map((a) => (
                <div key={a.title} className="km-badge">
                  <div className="km-badge-p" dir="ltr">+{n(Math.min(...a.options.map((o) => o.price)))}</div>
                  <div className="km-badge-t">{a.title}</div>
                  {!(a.options.length === 1 && a.options[0].name === a.title) && (
                    <div className="km-badge-o">{a.options.map((o) => o.name).join(" · ")}</div>
                  )}
                </div>
              ))}
            </div>
            {small.length > 0 && (
              <p className="km-also">
                {small.flatMap((g) => g.items).map((i) => (
                  <span key={i.id}>
                    {i.name} <b dir="ltr">{price(i)}</b>
                  </span>
                ))}
              </p>
            )}
            <p className="km-cur">الأسعار بالدينار العراقي</p>
          </section>
        )}

        <footer className="km-foot">
          <Zigzag className="km-zz km-zz-foot" />
          <div className="km-foot-in">
            {d.menuQr && (
              <div className="km-qr">
                <div className="km-qr-box" dangerouslySetInnerHTML={{ __html: d.menuQr }} />
                <div>
                  <div className="km-qr-t">المنيو في هاتفك</div>
                  <div className="km-qr-s">الصور والمكوّنات</div>
                </div>
              </div>
            )}
            {d.loyaltyQr && (
              <div className="km-qr">
                <div className="km-qr-box" dangerouslySetInnerHTML={{ __html: d.loyaltyQr }} />
                <div>
                  <div className="km-qr-t">نادي خزف</div>
                  <div className="km-qr-s">كل {d.per} مشروبات… والتالي علينا</div>
                </div>
              </div>
            )}
            <div className="km-contact">
              {d.address && <div>{d.address}</div>}
              <div dir="ltr">{[d.instagram && `@${d.instagram}`, d.phone].filter(Boolean).join("  ·  ")}</div>
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}

const CSS = `
@page { size: A4; margin: 0; }
.km-page { background: #d9d4ca; min-height: 100vh; padding: 16px 0 40px; font-family: Tajawal, system-ui, sans-serif; }
.km-bar { max-width: 210mm; margin: 0 auto 6px; display: flex; gap: 12px; align-items: center; padding: 0 8px; font-size: 13px; }
.km-link { color: #6B6B6B; text-decoration: none; white-space: nowrap; }
.km-tones { flex: 1; display: flex; gap: 6px; justify-content: center; }
.km-tone { display: inline-flex; align-items: center; gap: 6px; padding: 6px 12px; border-radius: 99px; background: #F4F1EA; color: #1A1A1A; text-decoration: none; font-weight: 600; border: 1px solid #E0DBD0; }
.km-tone.on { background: #1C1A18; color: #FAF7F0; border-color: #1C1A18; }
.km-dot { width: 12px; height: 12px; border-radius: 99px; border: 1px solid rgba(255,255,255,.4); }
.pm-btn { background: #1C1A18; color: #FAF7F0; border: 0; border-radius: 12px; padding: 10px 16px; font: 600 14px "IBM Plex Sans Arabic", sans-serif; cursor: pointer; white-space: nowrap; }
.km-tip { max-width: 210mm; margin: 0 auto 12px; padding: 0 8px; font-size: 12px; color: #6B6B6B; }
.km-warn { max-width: 210mm; margin: 0 auto 12px; padding: 0 8px; }

.km-sheet { position: relative; width: 210mm; height: 297mm; margin: 0 auto; background: var(--paper); color: var(--ink); overflow: hidden;
  display: flex; flex-direction: column; box-shadow: 0 10px 40px rgba(0,0,0,.18); -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.km-sheet > * { position: relative; z-index: 1; }

.km-rings { position: absolute !important; z-index: 0 !important; width: 120mm; height: 120mm; stroke: var(--accent); opacity: .14; }
.km-rings-a { top: -46mm; left: -46mm; }
.km-rings-b { bottom: 18mm; right: -58mm; }

.km-head { display: flex; align-items: flex-end; justify-content: center; gap: 7mm; padding: 8mm 14mm 0; }
.km-side { flex: 1; display: flex; flex-direction: column; gap: 2mm; padding-bottom: 6mm; font-size: 7.5pt; letter-spacing: .25em; color: var(--muted); }
.km-side-r { align-items: flex-start; letter-spacing: 0; font: 500 8.5pt "IBM Plex Sans Arabic", sans-serif; }
.km-side-l { align-items: flex-end; }
.km-zz { width: 100%; height: 3mm; stroke: var(--accent); }
.km-arch { width: 58mm; height: 40mm; background: var(--dark); color: var(--on-dark); border-radius: 31mm 31mm 2mm 2mm;
  display: flex; flex-direction: column; align-items: center; justify-content: center; padding-top: 5mm; box-sizing: border-box;
  box-shadow: inset 0 0 0 1.2mm var(--dark), inset 0 0 0 1.6mm var(--accent); }
.km-logo { font-family: Amiri, serif; font-weight: 700; font-size: 40pt; line-height: .9; }
.km-cafe { font-size: 6.5pt; letter-spacing: .55em; opacity: .55; margin-top: 2mm; }

.km-cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 7mm; padding: 10mm 13mm 0; align-items: start; }
.km-col { display: flex; flex-direction: column; gap: 8.5mm; }
.km-card { position: relative; background: var(--alt); border-radius: 13mm 13mm 3mm 3mm; padding: 7mm 5.5mm 2.5mm; border: 1px solid var(--line); }
.km-icon { position: absolute; top: -5.5mm; left: 50%; transform: translateX(-50%); width: 11mm; height: 11mm; border-radius: 99px; background: var(--dark);
  display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 1mm var(--paper); }
.km-icon svg { width: 6.2mm; height: 6.2mm; fill: none; stroke: var(--on-dark); stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.km-title { text-align: center; margin: 0 0 2.5mm; font: 700 12.5pt "IBM Plex Sans Arabic", sans-serif; color: var(--accent); }
.km-title span { display: block; font: 500 6.5pt Tajawal, sans-serif; letter-spacing: .35em; color: var(--muted); text-transform: uppercase; margin-top: .3mm; }
.km-card ul { list-style: none; margin: 0; padding: 0; }
.km-item { display: flex; align-items: center; justify-content: space-between; gap: 3mm; padding: 1.25mm 0; border-top: 1px dashed var(--line); }
.km-item:first-child { border-top: 0; }
.km-ar { font: 600 11pt "IBM Plex Sans Arabic", sans-serif; line-height: 1.25; }
.km-en { font-size: 7pt; letter-spacing: .08em; color: var(--muted); text-align: right; }
.km-star { font: 600 6.5pt "IBM Plex Sans Arabic", sans-serif; color: var(--accent); margin-inline-start: 2mm; vertical-align: middle; }
.km-price { flex-shrink: 0; min-width: 15mm; text-align: center; font: 700 10pt "IBM Plex Sans Arabic", sans-serif; font-variant-numeric: tabular-nums;
  background: var(--pill); color: var(--pill-ink); border-radius: 99px; padding: .9mm 2.6mm; }

.km-addons { padding: 4mm 13mm 0; text-align: center; }
.km-zz-wide { height: 3mm; margin-bottom: 2.5mm; }
.km-addons-h { margin: 0 0 3mm; font: 700 11pt "IBM Plex Sans Arabic", sans-serif; color: var(--accent); }
.km-badges { display: flex; justify-content: center; gap: 8mm; }
.km-badge { width: 32mm; }
.km-badge-p { width: 15mm; height: 15mm; margin: 0 auto 1.5mm; border-radius: 99px; border: 1.2px solid var(--accent); display: flex; align-items: center; justify-content: center;
  font: 700 9pt "IBM Plex Sans Arabic", sans-serif; color: var(--accent); font-variant-numeric: tabular-nums; }
.km-badge-t { font: 700 9.5pt "IBM Plex Sans Arabic", sans-serif; }
.km-badge-o { font-size: 7.5pt; color: var(--muted); margin-top: .4mm; }
.km-cur { font-size: 7pt; color: var(--muted); margin: 2mm 0 3mm; }
.km-also { margin: 3mm 0 0; font: 600 9.5pt "IBM Plex Sans Arabic", sans-serif; display: flex; justify-content: center; gap: 8mm; }
.km-also b { color: var(--accent); margin-inline-start: 1.5mm; }

.km-foot { margin-top: auto; background: var(--dark); color: var(--on-dark); padding: 0 14mm 5mm; flex-shrink: 0; }
.km-zz-foot { display: block; height: 3mm; margin: 0 -14mm 4mm; width: calc(100% + 28mm); stroke: var(--accent); opacity: .8; }
.km-foot-in { display: flex; align-items: center; gap: 8mm; }
.km-qr { display: flex; align-items: center; gap: 3mm; }
.km-qr-box { width: 18mm; height: 18mm; background: #FAF7F0; padding: 1.4mm; border-radius: 1.5mm; box-sizing: border-box; }
.km-qr-box svg { width: 100%; height: 100%; display: block; }
.km-qr-t { font: 600 9.5pt "IBM Plex Sans Arabic", sans-serif; }
.km-qr-s { font-size: 7.5pt; opacity: .6; margin-top: .6mm; }
.km-contact { margin-inline-start: auto; text-align: left; font-size: 7.5pt; opacity: .6; line-height: 1.7; }

@media print {
  @page { size: A4; margin: 0; }
  .km-sheet, .km-sheet * { visibility: visible !important; }
  .km-page { background: none; padding: 0; min-height: 0; }
  .km-bar, .km-tip, .km-warn { display: none !important; }
  .km-sheet { box-shadow: none; margin: 0; }
}
`;
