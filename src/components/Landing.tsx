import Link from "next/link";

/**
 * الصفحة التي يراها من كتب اسم النطاق.
 *
 * **كانت شاشة تسجيل دخول.** من فتح `khazaf.…` وجد حقلَ اسمٍ ورمزٍ لا
 * يملكهما — فيظنّ الموقع مغلقاً أو مخصّصاً لغيره، ويخرج. وأوّل شاشةٍ
 * يراها الغريب يجب أن تقول ما هذا المكان وأين هو ومتى يفتح.
 *
 * وهي صفحة **قراءة**: لا نموذج ولا حساب ولا شيء يُرسَل. الدعوة الوحيدة
 * فيها أن يفتح المنيو أو يجد الطريق.
 */
export default function Landing({
  shop,
  phone,
  address,
  mapsUrl,
  instagram,
  hours,
  story,
}: {
  shop: string;
  phone: string;
  address: string;
  mapsUrl: string;
  instagram: string;
  hours: string;
  story: string;
}) {
  const ig = instagram.replace(/^@+/, "");

  return (
    <main dir="rtl" className="relative min-h-screen bg-sand">
      <div className="grain" aria-hidden="true" />

      <header className="relative overflow-hidden bg-dark px-6 pb-24 pt-20 text-center">
        <div className="hero-glow" aria-hidden="true" />
        <div className="relative">
          <div className="font-serifar text-[4rem] leading-[0.95] text-cream">خزف</div>
          <div className="mt-2 text-[0.7rem] tracking-[0.45em] text-cream/40">C A F É</div>
          <div className="mx-auto mt-7 h-px w-14 bg-cream/20" />
          <p className="mx-auto mt-6 max-w-sm text-sm leading-relaxed text-cream/60">
            {story || "قهوة مختصّة، تُحضَّر على مهل."}
          </p>
        </div>
      </header>

      <div className="relative mx-auto -mt-12 w-full max-w-lg px-5 pb-20">
        {/* المنيو أوّلاً: هو ما جاء من أجله أكثر الناس */}
        <Link
          href="/menu"
          className="group block rounded-[1.6rem] bg-ink/[0.045] p-1.5 ring-1 ring-ink/[0.06] transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.99]"
        >
          <div className="flex items-center justify-between rounded-[1.225rem] bg-cream px-6 py-7">
            <div>
              <p className="font-serifar text-2xl text-ink">المنيو</p>
              <p className="mt-1 text-xs text-muted">كل ما نُحضّره، بأسعاره</p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-dark text-cream transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:-translate-x-1">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M11 18l-6-6 6-6" />
              </svg>
            </span>
          </div>
        </Link>

        <div className="mt-3 grid grid-cols-2 gap-3">
          <Tile
            href="/menu/en"
            title="English"
            sub="Menu"
            ltr
          />
          <Tile href="/loyalty" title="نادي خزف" sub="اجمع واستبدل" />
        </div>

        {/* أين ومتى — ما يبحث عنه من لم يأتِ بعد */}
        {(address || hours || phone || ig) && (
          <section className="mt-8 rounded-[1.6rem] bg-ink/[0.045] p-1.5 ring-1 ring-ink/[0.06]">
            <div className="space-y-4 rounded-[1.225rem] bg-cream px-6 py-6">
              {address && (
                <Row label="أين">
                  {mapsUrl ? (
                    <a
                      href={mapsUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-ink underline underline-offset-4"
                    >
                      {address}
                    </a>
                  ) : (
                    <span className="text-ink">{address}</span>
                  )}
                </Row>
              )}
              {hours && <Row label="متى">{hours}</Row>}
              {phone && (
                <Row label="هاتف">
                  {/* رقمٌ يُضغط فيُتّصل — لا نصٌّ يُنسخ بالإصبع */}
                  <a href={`tel:${phone}`} dir="ltr" className="nums text-ink underline underline-offset-4">
                    {phone}
                  </a>
                </Row>
              )}
              {ig && (
                <Row label="إنستغرام">
                  <a
                    href={`https://instagram.com/${ig}`}
                    target="_blank"
                    rel="noreferrer noopener"
                    dir="ltr"
                    className="text-ink underline underline-offset-4"
                  >
                    @{ig}
                  </a>
                </Row>
              )}
            </div>
          </section>
        )}

        <footer className="mt-12 text-center">
          <div className="mx-auto h-px w-14 bg-ink/10" />
          <p className="mt-6 font-serifar text-lg text-ink">{shop}</p>
          {/*
            مدخل الموظّفين في الذيل بخفوت: الصفحة للزبون، والباريستا
            يعرف طريقه — ورابطٌ صارخ «تسجيل الدخول» يجعل الصفحة تبدو
            لوحةَ تحكّمٍ لا مقهى.
          */}
          <Link href="/login" className="mt-6 inline-block text-[0.7rem] text-muted/70 underline underline-offset-4">
            دخول الموظفين
          </Link>
        </footer>
      </div>
    </main>
  );
}

function Tile({
  href,
  title,
  sub,
  ltr,
}: {
  href: string;
  title: string;
  sub: string;
  ltr?: boolean;
}) {
  return (
    <Link
      href={href}
      dir={ltr ? "ltr" : undefined}
      className="rounded-2xl border border-line bg-cream px-5 py-5 text-start transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]"
    >
      <p className="font-display font-bold text-ink">{title}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </Link>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="w-16 shrink-0 text-xs text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-sm leading-relaxed">{children}</span>
    </div>
  );
}
