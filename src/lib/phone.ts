/**
 * أرقام الهاتف العراقية — دوال خالصة تعمل في الخادم والمتصفح.
 *
 * التوحيد هنا هو **مفتاح حساب الولاء**: لو اختلف شكل الرقم بين التسجيل
 * والبحث لصار للزبون حسابان وضاعت أختامه. لذلك صيغة واحدة معتمدة:
 * `07XXXXXXXXX` — وكل ما عداها يُحوَّل إليها أو يُرفض.
 */

/** يوحّد الرقم إلى `07XXXXXXXXX` أو يُرجع null إن كان غير صالح. */
export function normalizePhone(input: string): string | null {
  const digits = (input ?? "").replace(/\D/g, "");

  let local: string;
  if (digits.length === 16 && digits.startsWith("00964")) local = "0" + digits.slice(5);
  else if (digits.length === 15 && digits.startsWith("00964")) local = "0" + digits.slice(5);
  else if (digits.length === 13 && digits.startsWith("964")) local = "0" + digits.slice(3);
  else if (digits.length === 11 && digits.startsWith("07")) local = digits;
  else if (digits.length === 10 && digits.startsWith("7")) local = "0" + digits;
  else return null;

  // شبكات العراق: 073 · 074 · 075 · 077 · 078 · 079
  return /^07[3-9]\d{8}$/.test(local) ? local : null;
}

/** يُخفي وسط الرقم للعرض: `0770****567`. */
export function maskPhone(phone: string): string {
  if (phone.length < 8) return phone;
  return phone.slice(0, 4) + "****" + phone.slice(-3);
}
