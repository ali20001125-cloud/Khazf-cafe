import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings, strSetting } from "@/lib/settings";
import { customerOrigin } from "@/lib/public-url";
import { printAddons, printMenu, stampsPerReward } from "@/lib/print-menu";
import PrintButton from "@/components/PrintButton";
import SiteWarning from "@/components/SiteWarning";

export const dynamic = "force-dynamic";
export const metadata = { title: "منيو كلاسيكي للطباعة — خزف" };

/**
 * المنيو الورقي «الاعتيادي» — على طريقة منيوهات المقاهي المحليّة.
 *
 * أراه المالك منيو مقهى آخر: أشرطةٌ متناوبة، اسمٌ عربيّ وتحته
 * إنجليزيّ، السعر كبيراً وتحته «دينار عراقي»، عناوين أقسامٍ كألسنة
 * داكنة، والمميّز شريطٌ داكن كامل. فهذا الشكل نفسه بألوان خزف — لا
 * بأزرق ذلك المقهى — والأسعار من الكتالوج كما في `../page.tsx`.
 */

const SECTIONS: { key: string; ar: string; en: string }[] = [
  { key: "espresso", ar: "إسبريسو", en: "Espresso" },
  { key: "hot", ar: "مشروبات ساخنة", en: "Hot drinks" },
  { key: "cold", ar: "مشروبات باردة", en: "Iced drinks" },
  { key: "filter", ar: "قهوة مختصّة", en: "Specialty filter" },
  { key: "other", ar: "أخرى", en: "Other" },
];

const n = (v: number) => v.toLocaleString("en-US");

export default async function ClassicPrintMenu() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "products.manage"))) redirect("/");

  const settings = await getSettings();
  const phone = strSetting(settings, "shop_phone", "");
  const instagram = strSetting(settings, "shop_instagram", "").replace(/^@+/, "");
  const address = strSetting(settings, "shop_address", "");

  const h = headers();
  const site = customerOrigin(
    settings.public_url,
    h.get("x-forwarded-host") ?? h.get("host") ?? "",
    h.get("x-forwarded-proto") ?? "https"
  );

  const [items, addons, per] = await Promise.all([
    printMenu(user.bid),
    printAddons(user.bid),
    stampsPerReward(),
  ]);

  const qr = (path: string) =>
    site.origin
      ? QRCode.toString(`${site.origin}${path}`, {
          type: "svg",
          margin: 0,
          errorCorrectionLevel: "M",
          color: { dark: "#1C1A18", light: "#FAF7F0" },
        })
      : Promise.resolve(null);
  const [menuQr, loyaltyQr] = await Promise.all([qr("/menu"), qr("/loyalty")]);

  const known = new Set(SECTIONS.map((s) => s.key));
  const groups = SECTIONS.map((s) => {
    const all = items.filter((i) =>
      s.key === "other" ? i.category === "other" || !known.has(i.category) : i.category === s.key
    );
    // المميّز شريطٌ بعرض الورقة بعد صفوف قسمه، لا خليّةٌ بينها
    return { ...s, plain: all.filter((i) => !i.special), special: all.filter((i) => i.special) };
  }).filter((g) => g.plain.length + g.special.length > 0);

  const price = (min: number, max: number) =>
    min === max ? n(min) : `${n(min)}–${n(max)}`;

  return (
    <div className="cm-page">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cm-bar">
        <Link href="/print/menu" className="cm-back">→ التصميم الآخر</Link>
        <div className="cm-tip">
          A4 · <b>بلا هوامش</b> · فعّل <b>رسومات الخلفية</b> — ثمّ «حفظ PDF». والمميّز في
          المنيو يُطبع شريطاً داكناً.
        </div>
        <PrintButton label="اطبع / احفظ PDF" />
      </div>
      {!site.configured && (
        <div className="cm-warn">
          <SiteWarning />
        </div>
      )}

      <article className="cm-sheet" dir="rtl">
        <header className="cm-head">
          <div className="cm-logo">خزف</div>
          <div className="cm-head-en" dir="ltr">
            KHAZAF
            <br />
            MENU
          </div>
        </header>

        <main className="cm-body">
          {groups.map((g) => (
            <section key={g.key} className="cm-sec">
              <h2 className="cm-tab">
                <span className="cm-tab-ar">{g.ar}</span>
                <span className="cm-tab-en" dir="ltr">{g.en}</span>
              </h2>

              {g.plain.length > 0 && (
                <div className="cm-grid">
                  {g.plain.map((i) => (
                    <div key={i.id} className="cm-cell">
                      <div className="cm-names">
                        <div className="cm-ar">{i.name}</div>
                        {i.nameEn && <div className="cm-en" dir="ltr">{i.nameEn}</div>}
                      </div>
                      <div className="cm-price">
                        <div className="cm-num" dir="ltr">{price(i.minPrice, i.maxPrice)}</div>
                        <div className="cm-cur">دينار عراقي</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {g.special.map((i) => (
                <div key={i.id} className="cm-cell cm-special">
                  <div className="cm-names">
                    <div className="cm-ar">{i.name}</div>
                    {i.nameEn && <div className="cm-en" dir="ltr">{i.nameEn}</div>}
                  </div>
                  <span className="cm-badge">مميّز</span>
                  <div className="cm-price">
                    <div className="cm-num" dir="ltr">{price(i.minPrice, i.maxPrice)}</div>
                    <div className="cm-cur">دينار عراقي</div>
                  </div>
                </div>
              ))}
            </section>
          ))}

          {addons.length > 0 && (
            <section className="cm-addons">
              <h2 className="cm-tab cm-tab-sm">
                <span className="cm-tab-ar">أضِف إلى مشروبك</span>
                <span className="cm-tab-en" dir="ltr">Add-ons</span>
              </h2>
              <div className="cm-addon-grid">
                {addons.map((a) => (
                  <div key={a.title} className="cm-addon">
                    <div className="cm-addon-t">{a.title}</div>
                    {!(a.options.length === 1 && a.options[0].name === a.title) && (
                      <div className="cm-addon-o">{a.options.map((o) => o.name).join(" · ")}</div>
                    )}
                    <div className="cm-addon-p" dir="ltr">
                      +{n(Math.min(...a.options.map((o) => o.price)))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </main>

        <footer className="cm-foot">
          {menuQr && (
            <div className="cm-qr">
              <div className="cm-qr-box" dangerouslySetInnerHTML={{ __html: menuQr }} />
              <div>
                <div className="cm-qr-t">المنيو في هاتفك</div>
                <div className="cm-qr-s">الصور والمكوّنات</div>
              </div>
            </div>
          )}
          {loyaltyQr && (
            <div className="cm-qr">
              <div className="cm-qr-box" dangerouslySetInnerHTML={{ __html: loyaltyQr }} />
              <div>
                <div className="cm-qr-t">نادي خزف</div>
                <div className="cm-qr-s">كل {per} مشروبات… والتالي علينا</div>
              </div>
            </div>
          )}
          <div className="cm-contact">
            {address && <div>{address}</div>}
            <div dir="ltr">{[instagram && `@${instagram}`, phone].filter(Boolean).join("  ·  ")}</div>
          </div>
        </footer>
      </article>
    </div>
  );
}

const CSS = `
@page { size: A4; margin: 0; }
.cm-page { background: #d9d4ca; min-height: 100vh; padding: 16px 0 40px; font-family: Tajawal, system-ui, sans-serif; }
.cm-bar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 12px; align-items: center; padding: 0 8px; font-size: 13px; color: #6B6B6B; }
.cm-back { color: #6B6B6B; text-decoration: none; white-space: nowrap; }
.cm-tip { flex: 1; line-height: 1.6; }
.pm-btn { background: #1C1A18; color: #FAF7F0; border: 0; border-radius: 12px; padding: 10px 16px; font: 600 14px "IBM Plex Sans Arabic", sans-serif; cursor: pointer; white-space: nowrap; }
.cm-warn { max-width: 210mm; margin: 0 auto 12px; padding: 0 8px; }

.cm-sheet { width: 210mm; height: 297mm; margin: 0 auto; background: #FAF7F0; color: #1A1A1A; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.18);
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.cm-head { margin: 0 10mm; background: #1C1A18; color: #FAF7F0; border-radius: 0 0 9mm 9mm; padding: 4mm 12mm 5mm; display: flex; align-items: center; justify-content: space-between; }
.cm-logo { font-family: Amiri, serif; font-weight: 700; font-size: 34pt; line-height: 1; }
.cm-head-en { font: 700 10pt "IBM Plex Sans Arabic", sans-serif; letter-spacing: .25em; line-height: 1.35; opacity: .55; text-align: left; }

.cm-body { flex: 1; min-height: 0; padding: 4mm 10mm 0; }
.cm-sec { margin-bottom: 2.6mm; }

/* لسان القسم: داكن، بزاويةٍ مقصوصة من جهة البداية */
.cm-tab { display: inline-flex; flex-direction: column; align-items: flex-start; background: #1C1A18; color: #FAF7F0; margin: 0 0 1.5mm; padding: 1.1mm 6mm 1.1mm 9mm;
  clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, 3.5mm 50%); }
.cm-tab-ar { font: 700 12pt "IBM Plex Sans Arabic", sans-serif; line-height: 1.25; }
.cm-tab-en { font: 500 7.5pt Tajawal, sans-serif; letter-spacing: .06em; opacity: .7; }
.cm-tab-sm .cm-tab-ar { font-size: 10.5pt; }

.cm-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 4mm; }
.cm-cell { display: flex; align-items: center; justify-content: space-between; padding: 1.2mm 4mm; min-height: 10mm; box-sizing: border-box; }
/* أشرطةٌ متناوبة بالصفّ لا بالخليّة: الخليّتان في الصفّ الواحد بلونٍ واحد */
.cm-grid .cm-cell:nth-child(4n+1), .cm-grid .cm-cell:nth-child(4n+2) { background: #EDE9DF; }
.cm-ar { font: 700 12pt "IBM Plex Sans Arabic", sans-serif; line-height: 1.2; }
.cm-en { font-size: 8.5pt; color: #6B6B6B; margin-top: .4mm; text-align: right; }
.cm-price { text-align: center; flex-shrink: 0; }
.cm-num { font: 700 12.5pt "IBM Plex Sans Arabic", sans-serif; font-variant-numeric: tabular-nums; line-height: 1.1; }
.cm-cur { font-size: 6.5pt; color: #6B6B6B; }

.cm-special { background: #1C1A18; color: #FAF7F0; margin-top: 1.5mm; border-radius: 2mm; }
.cm-special .cm-en, .cm-special .cm-cur { color: rgba(250,247,240,.6); }
.cm-badge { font: 600 8pt "IBM Plex Sans Arabic", sans-serif; color: #1C1A18; background: #A66A4C; padding: .6mm 3mm; border-radius: 9mm; margin-inline-start: auto; margin-inline-end: 6mm; }

.cm-addons { margin-top: 1mm; }
.cm-addon-grid { display: flex; gap: 3mm; }
.cm-addon { flex: 1; background: #EDE9DF; border-radius: 2mm; padding: 1.6mm 3mm; text-align: center; }
.cm-addon-t { font: 700 10pt "IBM Plex Sans Arabic", sans-serif; }
.cm-addon-o { font-size: 8pt; color: #6B6B6B; margin-top: .5mm; }
.cm-addon-p { font: 700 11pt "IBM Plex Sans Arabic", sans-serif; color: #A66A4C; margin-top: .8mm; }

.cm-foot { margin: 0 10mm; background: #1C1A18; color: #FAF7F0; border-radius: 9mm 9mm 0 0; padding: 4mm 12mm; flex-shrink: 0; display: flex; align-items: center; gap: 8mm; }
.cm-qr { display: flex; align-items: center; gap: 3mm; }
.cm-qr-box { width: 19mm; height: 19mm; background: #FAF7F0; padding: 1.4mm; border-radius: 1.5mm; box-sizing: border-box; }
.cm-qr-box svg { width: 100%; height: 100%; display: block; }
.cm-qr-t { font: 600 9.5pt "IBM Plex Sans Arabic", sans-serif; }
.cm-qr-s { font-size: 7.5pt; opacity: .55; margin-top: .6mm; }
.cm-contact { margin-inline-start: auto; text-align: left; font-size: 7.5pt; opacity: .55; line-height: 1.7; }

@media print {
  /* قاعدة فاتورة الكاشير في globals.css تُخفي كل شيء إلا #receipt */
  @page { size: A4; margin: 0; }
  .cm-sheet, .cm-sheet * { visibility: visible !important; }
  html, body { background: #FAF7F0 !important; }
  .cm-page { background: none; padding: 0; min-height: 0; }
  .cm-bar, .cm-warn { display: none !important; }
  .cm-sheet { box-shadow: none; margin: 0; }
}
`;
