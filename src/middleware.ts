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

/**
 * نطاق الزبون — والفصل الذي لا يحتاج نشرتين.
 *
 * قال المالك: نرفع المنيو على نطاقٍ ثانٍ ونترك هذا للإدارة. والفكرة
 * صحيحة: نطاقٌ يعرفه الزبون لا يجوز أن يكون فيه بابُ عملٍ أصلاً، ولو
 * كان محروساً.
 *
 * لكن **نشرتين** تعني رفع كل إصلاحٍ مرّتين إلى الأبد، ومتغيّرات
 * مضاعفة، وخطر أن تُصلَح علّةٌ في واحدة وتُنسى في الأخرى. والبيانات
 * لن تنفصل على كل حال — القاعدة واحدة.
 *
 * فالنطاقان يشيران إلى التطبيق نفسه، وهذا السطر يقرّر: ما جاء على
 * نطاق الزبون لا يرى `/login` ولا `/manage` ولا `/pos` — يُعرض له
 * المنيو مكانها. لا خطأ ولا صفحةٌ مكسورة: كأنّ تلك الصفحات غير
 * موجودة على هذا النطاق.
 *
 * **وفارغٌ يعني: نطاقٌ واحد كما كان.** فلا ينكسر شيء قبل أن يضبطه.
 */
const PUBLIC_HOST = (process.env.PUBLIC_HOST ?? "").trim().toLowerCase();

/** ما يخصّ العمل — يُحجب عن نطاق الزبون. */
const BUSINESS = ["/pos", "/manage", "/login", "/locked"];

/**
 * المضيف كما طلبه المتصفّح.
 *
 * `x-forwarded-host` أوّلاً: هوستنجر تضع خلفها وسيطاً، و`host` عنده
 * يكون اسم الخادم الداخلي لا نطاق المالك.
 */
function askedHost(req: NextRequest): string {
  const h = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "";
  // بلا المنفذ: «menu.khazaf.com:443» و«menu.khazaf.com» نطاقٌ واحد
  return h.split(",")[0].trim().toLowerCase().split(":")[0];
}

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

  // على نطاق الزبون: لا وجود لصفحات العمل
  if (PUBLIC_HOST && askedHost(req) === PUBLIC_HOST) {
    /*
     * والجذر منها.
     *
     * كان يمرّ لأنه ليس في `BUSINESS`، فيعرض **اللوحة** لمن يحمل جلسة
     * — أي للمالك أو الباريستا حين يفتح نطاق الزبون على هاتفه. لا
     * يراها زبون، لكنها تناقض الوعد: هذا النطاق لا عمل فيه. (ظهر في
     * الاختبار بعد أن بدا الفصل تامّاً.)
     */
    if (path === "/" || BUSINESS.some((p) => path === p || path.startsWith(`${p}/`))) {
      return NextResponse.rewrite(new URL("/menu", req.url));
    }
    return NextResponse.next();
  }

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
  // يمرّ على كل شيء إلّا ملفّات البناء: الفصل بالنطاق يحتاج أن يرى
  // `/login` أيضاً، لا الصفحات المحروسة وحدها
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
