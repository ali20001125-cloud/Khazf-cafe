import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings, strSetting } from "@/lib/settings";
import { customerOrigin } from "@/lib/public-url";
import { printAddons, printMenu, stampsPerReward, type PrintItem } from "@/lib/print-menu";
import PrintButton from "@/components/PrintButton";
import SiteWarning from "@/components/SiteWarning";

export const dynamic = "force-dynamic";
export const metadata = { title: "منيو للطباعة — خزف" };

/**
 * المنيو الورقي — ورقة A4 واحدة للطاولة.
 *
 * **غير تصميم الهاتف عمداً** (قال المالك: «مو حلو يصير نفس الإلكتروني»):
 * الهاتف بطاقاتٌ تُضغط وتنفتح، والورقة تُقرأ من بعيد ولا تُضغط. فهنا
 * قائمةٌ تحريرية: اسمٌ ونقاطٌ تقود العين إلى السعر، والإنجليزي همسٌ تحت
 * الاسم، والصور والمكوّنات تُترك للرمز — «التفاصيل في هاتفك».
 *
 * والأسعار من الكتالوج نفسه (`print-menu.ts`)، فتُطبع نسخةٌ جديدة بعد
 * كل تغيير سعر بلا مصمّم.
 *
 * وتوزيع الألوان من نظام البراند: بيجٌ أغلب الورقة، والداكن للرأس
 * والذيل، والطينيّ في العناوين وحدها.
 */

const SECTIONS: { key: string; ar: string; en: string }[] = [
  { key: "espresso", ar: "إسبريسو", en: "ESPRESSO" },
  { key: "hot", ar: "ساخن", en: "HOT" },
  { key: "cold", ar: "بارد", en: "COLD" },
  { key: "filter", ar: "مختص", en: "FILTER" },
  { key: "other", ar: "أخرى", en: "OTHER" },
];

const n = (v: number) => v.toLocaleString("en-US");
const price = (i: PrintItem) =>
  i.minPrice === i.maxPrice ? n(i.minPrice) : `${n(i.minPrice)} – ${n(i.maxPrice)}`;

export default async function PrintMenuPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "products.manage"))) redirect("/");

  const settings = await getSettings();
  const story = strSetting(settings, "shop_story", "قهوة مختصّة، تُحضَّر على مهل");
  const address = strSetting(settings, "shop_address", "");
  const phone = strSetting(settings, "shop_phone", "");
  const instagram = strSetting(settings, "shop_instagram", "").replace(/^@+/, "");
  const currency = strSetting(settings, "currency", "د.ع");

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
  const groups = SECTIONS.map((s) => ({
    ...s,
    items: items.filter((i) =>
      s.key === "other" ? i.category === "other" || !known.has(i.category) : i.category === s.key
    ),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="pm-page">
      {/* `dangerouslySetInnerHTML` لا نصّ ابن: React يهرّب علامات التنصيص
          في النصّ فيختلف ما رسمه الخادم عمّا يرسمه المتصفّح (hydration) */}
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* شريط الشاشة — لا يُطبع */}
      <div className="pm-bar">
        <Link href="/manage/menu" className="pm-back">→ المنيو</Link>
        <Link href="/print/menu/classic" className="pm-back">الكلاسيكي ←</Link>
        <Link href="/print/menu/ceramic" className="pm-back">خزف (بالنقوش) ←</Link>
        <div className="pm-tip">
          اطبع على A4 · <b>بلا هوامش</b> · فعّل <b>رسومات الخلفية</b> — ثمّ «حفظ PDF» وخذه للمطبعة.
          الأسعار من النظام الآن: غيّر سعراً واطبع من جديد.
        </div>
        <PrintButton label="اطبع / احفظ PDF" />
      </div>
      {!site.configured && (
        <div className="pm-warn">
          <SiteWarning />
        </div>
      )}

      <article className="pm-sheet" dir="rtl">
        <header className="pm-head">
          <div className="pm-logo">خزف</div>
          <div className="pm-cafe">C A F É</div>
          <div className="pm-rule" />
          <div className="pm-story">{story}</div>
        </header>

        <main className="pm-body">
          <div className="pm-note">الأسعار بالدينار العراقي ({currency})</div>
          <div className="pm-cols">
            {groups.map((g) => (
              <section key={g.key} className="pm-sec">
                <h2 className="pm-sec-h">
                  <span>{g.ar}</span>
                  <span className="pm-sec-en">{g.en}</span>
                </h2>
                <ul>
                  {g.items.map((i) => (
                    <li key={i.id} className="pm-item">
                      <div className="pm-row">
                        <span className="pm-name">{i.name}</span>
                        <span className="pm-dots" />
                        <span className="pm-price" dir="ltr">{price(i)}</span>
                      </div>
                      {i.nameEn && <div className="pm-en" dir="ltr">{i.nameEn}</div>}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {addons.length > 0 && (
            <section className="pm-addons">
              <h2 className="pm-addons-h">أضِف إلى مشروبك</h2>
              <div className="pm-addons-list">
                {addons.map((a) => {
                  const same = a.options.every((o) => o.price === a.options[0].price);
                  const single = a.options.length === 1 && a.options[0].name === a.title;
                  return (
                    <span key={a.title} className="pm-addon">
                      <b>{a.title}</b>
                      {!single && <> {a.options.map((o) => o.name).join(" / ")}</>}
                      <span className="pm-addon-p" dir="ltr">
                        {same
                          ? `+${n(a.options[0].price)}`
                          : a.options.map((o) => `+${n(o.price)}`).join(" / ")}
                      </span>
                    </span>
                  );
                })}
              </div>
            </section>
          )}
        </main>

        <footer className="pm-foot">
          {menuQr && (
            <div className="pm-qr">
              <div className="pm-qr-box" dangerouslySetInnerHTML={{ __html: menuQr }} />
              <div>
                <div className="pm-qr-t">المنيو في هاتفك</div>
                <div className="pm-qr-s">الصور والمكوّنات وما يُضاف</div>
              </div>
            </div>
          )}
          {loyaltyQr && (
            <div className="pm-qr">
              <div className="pm-qr-box" dangerouslySetInnerHTML={{ __html: loyaltyQr }} />
              <div>
                <div className="pm-qr-t">نادي خزف</div>
                <div className="pm-qr-s">كل {per} مشروبات… والتالي علينا</div>
              </div>
            </div>
          )}
          <div className="pm-contact">
            {address && <div>{address}</div>}
            <div dir="ltr">
              {[instagram && `@${instagram}`, phone].filter(Boolean).join("  ·  ")}
            </div>
          </div>
        </footer>
      </article>
    </div>
  );
}

const CSS = `
@page { size: A4; margin: 0; }
.pm-page { background: #d9d4ca; min-height: 100vh; padding: 16px 0 40px; font-family: Tajawal, system-ui, sans-serif; }
.pm-bar { max-width: 210mm; margin: 0 auto 12px; display: flex; gap: 12px; align-items: center; justify-content: space-between; padding: 0 8px; color: #1C1A18; font-size: 13px; }
.pm-back { color: #6B6B6B; text-decoration: none; white-space: nowrap; }
.pm-tip { flex: 1; color: #6B6B6B; line-height: 1.6; }
.pm-btn { background: #1C1A18; color: #FAF7F0; border: 0; border-radius: 12px; padding: 10px 16px; font: 600 14px "IBM Plex Sans Arabic", sans-serif; cursor: pointer; white-space: nowrap; }
.pm-warn { max-width: 210mm; margin: 0 auto 12px; padding: 0 8px; }

.pm-sheet { width: 210mm; height: 297mm; margin: 0 auto; background: #F4F1EA; color: #1A1A1A; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,.18);
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }

.pm-head { background: #1C1A18; color: #FAF7F0; text-align: center; padding: 13mm 0 10mm; }
.pm-logo { font-family: Amiri, serif; font-weight: 700; font-size: 58pt; line-height: .9; }
.pm-cafe { margin-top: 3mm; font-size: 7.5pt; letter-spacing: .55em; opacity: .45; }
.pm-rule { width: 14mm; height: 1px; background: rgba(250,247,240,.25); margin: 5mm auto 4mm; }
.pm-story { font-size: 10pt; opacity: .6; }

.pm-body { flex: 1; padding: 8mm 16mm 0; display: flex; flex-direction: column; }
.pm-note { text-align: center; font-size: 8pt; color: #6B6B6B; margin-bottom: 6mm; }
.pm-cols { column-count: 2; column-gap: 14mm; column-fill: balance; flex: 1; }
.pm-sec { break-inside: avoid; margin-bottom: 7mm; }
.pm-sec-h { display: flex; align-items: baseline; justify-content: space-between; margin: 0 0 3.5mm; padding-bottom: 2mm; border-bottom: 1px solid #E0DBD0;
  font: 700 13pt "IBM Plex Sans Arabic", sans-serif; color: #A66A4C; }
.pm-sec-en { font: 500 7pt Tajawal, sans-serif; letter-spacing: .3em; color: #6B6B6B; }
.pm-sec ul { list-style: none; margin: 0; padding: 0; }
.pm-item { margin-bottom: 3.2mm; break-inside: avoid; }
.pm-row { display: flex; align-items: baseline; gap: 2mm; }
.pm-name { font: 600 11.5pt "IBM Plex Sans Arabic", sans-serif; white-space: nowrap; }
.pm-dots { flex: 1; border-bottom: 1px dotted #b9b1a3; transform: translateY(-1.2mm); min-width: 6mm; }
.pm-price { font: 600 11pt "IBM Plex Sans Arabic", sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pm-en { font-size: 7pt; letter-spacing: .12em; text-transform: uppercase; color: #8a8478; margin-top: .6mm; text-align: right; }

.pm-addons { background: #EDE9DF; margin: 0 -16mm; padding: 5mm 16mm; text-align: center; }
.pm-addons-h { margin: 0 0 2.5mm; font: 700 10.5pt "IBM Plex Sans Arabic", sans-serif; color: #A66A4C; }
.pm-addons-list { display: flex; flex-wrap: wrap; justify-content: center; gap: 2mm 9mm; font-size: 9.5pt; }
.pm-addon b { font-family: "IBM Plex Sans Arabic", sans-serif; font-weight: 600; }
.pm-addon-p { margin-right: 2mm; margin-left: 0; font-weight: 700; color: #8A6B4E; font-variant-numeric: tabular-nums; }

.pm-foot { background: #1C1A18; color: #FAF7F0; padding: 7mm 16mm; display: flex; align-items: center; gap: 9mm; }
.pm-qr { display: flex; align-items: center; gap: 3.5mm; }
.pm-qr-box { width: 21mm; height: 21mm; background: #FAF7F0; padding: 1.6mm; border-radius: 1.5mm; box-sizing: border-box; }
.pm-qr-box svg { width: 100%; height: 100%; display: block; }
.pm-qr-t { font: 600 10pt "IBM Plex Sans Arabic", sans-serif; }
.pm-qr-s { font-size: 7.5pt; opacity: .55; margin-top: .8mm; }
.pm-contact { margin-inline-start: auto; text-align: left; font-size: 7.5pt; opacity: .55; line-height: 1.7; }

@media print {
  /* قاعدة فاتورة الكاشير في globals.css تُخفي كل شيء إلا #receipt
     وتجعل الصفحة ٨٠مم — فطبعت هذه الورقة بيضاء. تُلغى هنا وحدها. */
  @page { size: A4; margin: 0; }
  .pm-sheet, .pm-sheet * { visibility: visible !important; }
  html, body { background: #F4F1EA !important; }
  .pm-page { background: none; padding: 0; min-height: 0; }
  .pm-bar, .pm-warn { display: none !important; }
  .pm-sheet { box-shadow: none; margin: 0; }
}
`;
