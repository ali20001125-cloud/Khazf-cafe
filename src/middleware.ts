import { NextResponse, type NextRequest } from "next/server";

/**
 * بوّابة الشاشة المقفلة.
 *
 * جرّبتُ أوّلاً أن يمتنع التخطيط عن عرض `children` حين تكون الجلسة
 * مقفلة. بدا صحيحاً على الشاشة وكان ناقصاً: ملاحة Next تُرسل حمولة
 * الصفحة مع الردّ حتى لو لم يعرضها التخطيط، فبقي «إيراد اليوم» مقروءاً
 * في مصدر الصفحة بعد التحديث. الستارة كانت على البكسلات لا على البيانات.
 *
 * والوسيط يقع **قبل** أن تُبنى الصفحة أصلاً، فلا شيء يُجلب ولا شيء
 * يُرسَل.
 *
 * ولا يتحقّق من التوقيع هنا: التحقّق يحتاج تعمية لا تتوفّر في بيئة
 * الحافّة، ولا يلزم. فهذا الفحص يقرّر **الإخفاء** لا السماح — ومن عبث
 * بالكوكي ليمحو الوسم كسر التوقيع، فترفضه `readSession` وتُعيده إلى
 * شاشة الدخول. وكل فعلٍ خادميّ يمرّ على `requirePermission` التي تفحص
 * الوسم بعد التحقّق من التوقيع.
 */
const GUARDED = ["/pos", "/manage"];

function isLocked(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  try {
    const body = token.slice(0, dot).replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(body))?.lk === 1;
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (!GUARDED.some((p) => path === p || path.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  if (!isLocked(req.cookies.get("khazf_session")?.value)) {
    return NextResponse.next();
  }
  // إعادة كتابة لا تحويل: يبقى الرابط كما هو، فيعود الباريستا إلى
  // الشاشة نفسها بعد الفتح بلا أن يبحث عنها
  return NextResponse.rewrite(new URL("/locked", req.url));
}

export const config = {
  matcher: ["/pos/:path*", "/manage/:path*"],
};
