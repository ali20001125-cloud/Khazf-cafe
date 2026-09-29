/**
 * بوّابة الأجهزة الموثوقة — موقع العمل لا يُرى إلّا من أجهزة المحلّ.
 *
 * قال المالك: «ممكن أيّ شخص يعرف pos.khazf.shop ويشوف شاشة الدخول».
 * والاسم والرمز والقفل بعد خمس محاولات تحرس الدخول، لكن الشاشة نفسها
 * تُرى — وهي تقول لمن فتحها: هنا بابٌ يُطرق.
 *
 * فالجهاز يُسجَّل مرّةً واحدة: يفتح المالك رابطاً سرّياً عليه
 * (`/device/<المفتاح>`)، فيُحفظ في المتصفّح وسمٌ لسنة. وما لا وسم عليه
 * لا يرى شاشة دخولٍ ولا لوحةً ولا كاشيراً — يرى المنيو، كأنّ الموقع
 * موقع مقهى عاديّ.
 *
 * **المفتاح نفسه لا يُحفظ في المتصفّح** — بصمته وحدها. ومن سرق الوسم من
 * جهازٍ لا يعرف منه المفتاح ليُسجّل جهازاً آخر.
 *
 * **ومعطّلةٌ ما دام `STAFF_DEVICE_KEY` فارغاً**: لا ينقفل أحد قبل أن
 * يقرّرها المالك. ومن فقد رابطه: يغيّر المفتاح في الاستضافة، فتسقط
 * الأجهزة كلّها ويُسجّلها من جديد — وهذا نفسه طريق طرد جهازٍ ضاع.
 */

export const DEVICE_COOKIE = "khazf_device";

/** سنة: الجهاز جهاز المحلّ، لا جلسةٌ تنتهي. */
export const DEVICE_MAX_AGE = 60 * 60 * 24 * 365;

/** المفتاح من البيئة، أو لا شيء. */
export function deviceKeyFromEnv(): string | null {
  const k = (process.env.STAFF_DEVICE_KEY ?? "").trim();
  return k.length > 0 ? k : null;
}

/**
 * بصمة المفتاح — ما يُحفظ في الكوكي.
 *
 * Web Crypto لا `node:crypto`: الوسيط يعمل على الحافّة، والدالّة نفسها
 * تُستدعى من هناك ومن الخادم.
 */
export async function deviceToken(key: string): Promise<string> {
  const data = new TextEncoder().encode(`khazf-device:${key}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** مقارنةٌ لا يكشف زمنها أين اختلف النصّان. */
export function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** هل هذا الجهاز موثوق؟ بلا مفتاحٍ مضبوط: البوّابة مفتوحة للجميع. */
export async function deviceTrusted(
  cookieValue: string | undefined,
  key: string | null
): Promise<boolean> {
  if (!key) return true;
  if (!cookieValue) return false;
  return sameText(cookieValue, await deviceToken(key));
}
