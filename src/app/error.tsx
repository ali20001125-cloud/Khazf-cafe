"use client";

/**
 * شاشة خطأ مفهومة بدل صفحة ٥٠٠ البيضاء.
 * السبب الأشيع في هذا النظام: متغيّر البيئة DATABASE_URL غير مضبوط على Vercel
 * (لا يمكن للتطبيق الوصول لقاعدة البيانات) — فنقولها بالعربية بدل شاشة فارغة.
 */
export default function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center" dir="rtl">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">⚠️</div>
      <h1 className="mt-5 font-display text-2xl font-bold text-ink">تعذّر فتح الواجهة</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        النظام لم يستطع الوصول لقاعدة البيانات. غالباً إعداد الاتصال
        (<span className="nums">DATABASE_URL</span>) ناقص أو تغيّر في لوحة النشر.
        بياناتك سليمة ولم يضِع منها شيء.
      </p>
      <button onClick={reset} className="btn-primary mt-6 px-10 py-4 text-lg">
        أعد المحاولة
      </button>
      {error.digest && (
        <p className="nums mt-6 text-[11px] text-muted/70">رمز الخطأ: {error.digest}</p>
      )}
    </main>
  );
}
