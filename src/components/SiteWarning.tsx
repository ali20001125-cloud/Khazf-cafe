import Link from "next/link";

/**
 * تنبيهٌ فوق كل رمز QR ما دام «موقع الزبائن» غير مضبوط.
 *
 * بدونه يُطبع رمزٌ يشير إلى موقع الإدارة — والطباعة لا تُسترجع: الورقة
 * تبقى على الطاولة أشهراً.
 */
export default function SiteWarning() {
  return (
    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
      <p className="font-semibold">لا تطبع هذا الرمز بعد.</p>
      <p className="mt-1 text-xs">
        هو الآن يفتح <b>هذا الموقع — موقع الإدارة</b>. اكتب رابط موقع المنيو
        في الإعدادات، فيتغيّر الرمز إليه.
      </p>
      <Link
        href="/manage/settings#public-url"
        className="mt-2 inline-block text-xs font-semibold underline"
      >
        اضبطه من الإعدادات ←
      </Link>
    </div>
  );
}
