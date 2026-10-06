import { NextResponse, type NextRequest } from "next/server";
import { DEVICE_COOKIE, deviceKeyFromEnv, deviceTrusted } from "@/lib/device-gate";

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

/**
 * نشرة المنيو وحده — لا تعرف غير المنيو، على أيّ نطاقٍ فُتحت.
 *
 * المالك لم يشترِ نطاقاً بعد. والنطاق المؤقّت الذي تعطيه هوستنجر
 * يخصّ موقعاً واحداً، فلا يُضاف إلى الموقع الحالي نطاقٌ ثانٍ مجّاناً.
 * فالمنيو صار موقعاً ثانياً من الكود نفسه، وهذا المتغيّر فيه وحده.
 *
 * وهو أمتن من `PUBLIC_HOST` لهذا الموقع: لا يعتمد على أن يصل اسم
 * النطاق كما نتوقّع من وسيط هوستنجر — لو اختلف حرفٌ واحد لظهرت
 * صفحة الدخول. هنا لا مقارنة أصلاً.
 *
 * ويُقرأ عند البناء (الوسيط يعمل على الحافّة)، فيُضبط قبل النشر.
 */
const MENU_ONLY = (process.env.MENU_ONLY ?? "").trim() === "1";

/** ما يخصّ العمل — يُحجب عن نطاق الزبون. */
const BUSINESS = ["/pos", "/manage", "/login", "/locked", "/device", "/print"];

/**
 * مفتاح الأجهزة الموثوقة (`lib/device-gate.ts`). فارغٌ = البوّابة مفتوحة.
 * يُقرأ مرّةً: الوسيط يعمل على الحافّة، والمتغيّر يُضبط قبل النشر.
 */
const DEVICE_KEY = deviceKeyFromEnv();

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

/** 404 بلا صفحة Next ولا تصميم: لا شيء فيها يقول لمن هذا الموقع. */
function notFound(): NextResponse {
  return new NextResponse("404 Not Found", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // على نطاق الزبون: لا وجود لصفحات العمل
  if (MENU_ONLY || (PUBLIC_HOST && askedHost(req) === PUBLIC_HOST)) {
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

  /*
   * موقع العمل من جهازٍ غير مسجَّل: **404 عارية، في كل مسار.**
   *
   * كان يعرض المنيو مكان صفحات العمل. وقال المالك: لا داعي للمنيو هنا،
   * له نطاقه — وهذا الموقع لا يُظهر شيئاً لمن لم يُسجَّل. فلا منيو ولا
   * ولاء ولا شعار ولا اسم مقهى: ردٌّ بلا هويّة، كأنّ النطاق فارغ.
   * والأفعال الخادمية (POST) تُردّ هنا أيضاً قبل أن تُنفَّذ.
   *
   * و`/device/…` وحده يمرّ: منه يُسجَّل الجهاز، ومفتاحٌ خاطئ فيه يُردّ
   * 404 بالشكل نفسه (`app/device/[key]/route.ts`). (انظر `lib/device-gate.ts`)
   */
  if (
    DEVICE_KEY &&
    !path.startsWith("/device/") &&
    !(await deviceTrusted(req.cookies.get(DEVICE_COOKIE)?.value, DEVICE_KEY))
  ) {
    return notFound();
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
