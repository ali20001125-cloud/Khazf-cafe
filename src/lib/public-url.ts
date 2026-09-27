/**
 * عنوان موقع الزبائن — الذي تُبنى عليه رموز QR.
 *
 * كان الرمز يُبنى من المضيف الذي يزوره المالك لحظتها. وكان هذا صحيحاً
 * يوم كان الموقع واحداً. ثمّ صار المنيو موقعاً ثانياً (`MENU_ONLY`)،
 * والمالك يطبع الرمز من لوحة الإدارة — فخرج الرمز **يشير إلى موقع
 * الإدارة**. رمزٌ على كل طاولة يفتح للزبون الموقع الذي أردنا إخفاءه.
 *
 * فالعنوان يُكتب مرّةً في الإعدادات، ويوم يشتري المالك نطاقاً يغيّره
 * هناك بلا نشرٍ ولا متغيّر.
 */

/** يقبل «xxx.hostingersite.com» أو رابطاً كاملاً، ويُرجع الأصل وحده. */
export function cleanOrigin(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // اسمٌ فيه نقطة على الأقلّ: «menu» وحدها ليست نطاقاً
    if (!u.hostname.includes(".") || u.username || u.password) return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * الأصل الذي يُعطى للزبون: المضبوط في الإعدادات، وإلّا المضيف الحاليّ
 * مع علامةٍ تقول إنه ليس المقصود — فتُنبَّه الشاشة بدل أن تطبع رمزاً
 * خاطئاً بصمت.
 */
export function customerOrigin(
  setting: unknown,
  host: string,
  proto: string
): { origin: string | null; configured: boolean } {
  const set = cleanOrigin(setting);
  if (set) return { origin: set, configured: true };
  return { origin: host ? `${proto}://${host}` : null, configured: false };
}
