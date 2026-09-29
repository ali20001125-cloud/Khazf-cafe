import { NextResponse, type NextRequest } from "next/server";
import {
  DEVICE_COOKIE,
  DEVICE_MAX_AGE,
  deviceKeyFromEnv,
  deviceToken,
  sameText,
} from "@/lib/device-gate";

export const dynamic = "force-dynamic";

/**
 * تسجيل جهازٍ موثوق: `/device/<المفتاح>`.
 *
 * يفتحه المالك مرّةً على تابلت الكاشير وعلى هاتفه، فيُحفظ الوسم ويُحوَّل
 * إلى شاشة الدخول. ومفتاحٌ خاطئ لا يقول «خطأ» — يُحوَّل إلى المنيو كأنّ الرابط
 * لا يعني شيئاً، فلا يعرف من يجرّب أنه قريب.
 */
function go(path: string): NextResponse {
  return new NextResponse(null, { status: 307, headers: { Location: path } });
}

export async function GET(_req: NextRequest, { params }: { params: { key: string } }) {
  const key = deviceKeyFromEnv();
  const given = decodeURIComponent(params.key ?? "").trim();

  // تحويلٌ لا `rewrite` (إعادة الكتابة لا تعمل من معالج مسار)، وبمسارٍ
  // نسبيّ: خلف وسيط هوستنجر قد يكون `req.url` عنوان الخادم الداخلي لا
  // pos.khazf.shop، فيُرسَل المالك إلى عنوانٍ لا يفتح.
  if (!key || !sameText(given, key)) return go("/menu");

  const res = go("/login");
  res.cookies.set(DEVICE_COOKIE, await deviceToken(key), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_MAX_AGE,
  });
  // الرابط السرّي لا يبقى في سجلّ المتصفّح مرجعاً لصفحةٍ أخرى
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
