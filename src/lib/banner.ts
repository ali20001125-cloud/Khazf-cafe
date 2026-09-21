/**
 * شريط العروض أعلى المنيو.
 *
 * **ينتهي وحده.** وهذه ليست ميزةً إضافية — هي سبب وجود الشريط بهذه
 * الصورة. شريطٌ يبقى حتى يُزال يدوياً ينسى صاحبه إزالته، فيقرأ زبونُ
 * الخميس «مشروب اليوم: موكا الكراميل» وقد نفد يوم الثلاثاء. وشريطٌ
 * كاذب أسوأ من لا شريط: هو وعدٌ مكتوبٌ يُخلَف أمام الزبون.
 *
 * فالتاريخ مطلوب، والانتهاء يقع في القراءة لا في مهمّةٍ مجدولة: لا
 * شيء يحتاج أن يعمل في الخلفية كي يصمت الشريط.
 *
 * والحساب منفصلٌ عن الشاشة كي يُختبر — «هل انتهى؟» سؤالُ تواريخ، وهي
 * تُخطئ بصمت.
 */

export type BannerTone = "news" | "warn";

export type Banner = { text: string; tone: BannerTone; until: string | null };

/** آخر يومٍ يظهر فيه الشريط — يظهر فيه كلّه حتى منتصف ليله. */
export function bannerLive(b: Banner | null, now: Date): boolean {
  if (!b) return false;
  if (b.text.trim().length === 0) return false;
  if (!b.until) return true;

  // `until` تاريخٌ كـ«٢٠٢٦-٠٩-٢٥»، والمقصود «إلى آخر ذلك اليوم» لا
  // «إلى فجره». ولذلك تُقارَن التواريخ لا اللحظات.
  const today = dayKey(now);
  return today <= b.until;
}

/** اليوم بتوقيت بغداد — لا بتوقيت الخادم، فهو في أوروبا. */
export function dayKey(d: Date): string {
  // en-CA يعطي «YYYY-MM-DD»، وهو ما يُقارَن نصّاً بترتيبٍ صحيح
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Baghdad" });
}

/** قراءة الشريط من الإعدادات، بلا ثقةٍ في شكل ما هو مخزَّن. */
export function readBanner(s: Record<string, unknown>): Banner | null {
  const text = typeof s.menu_banner_text === "string" ? s.menu_banner_text : "";
  if (text.trim().length === 0) return null;
  const tone: BannerTone = s.menu_banner_tone === "warn" ? "warn" : "news";
  const until =
    typeof s.menu_banner_until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s.menu_banner_until)
      ? s.menu_banner_until
      : null;
  return { text, tone, until };
}
