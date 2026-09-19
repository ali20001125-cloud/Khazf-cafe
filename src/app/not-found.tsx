import Link from "next/link";

/**
 * ٤٠٤ بالعربية.
 *
 * بلا هذا الملفّ يعرض Next صفحته الإنجليزية: «This page could not be
 * found». والباريستا الذي يفتح رابطاً قديماً وسط الخدمة يقرأ إنجليزيةً
 * لا تعنيه ولا يجد طريق العودة.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <p className="nums font-display text-5xl font-bold text-line">404</p>
      <h1 className="mt-3 font-display text-xl font-bold text-ink">
        هذه الصفحة غير موجودة
      </h1>
      <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted">
        ربما تغيّر الرابط أو حُذف ما كان فيه. لم يضِع شيء من بياناتك.
      </p>
      <Link href="/" className="btn-primary mt-6 px-6">
        الرئيسية
      </Link>
    </main>
  );
}
