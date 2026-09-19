import "server-only";

/**
 * حدّ معدّلٍ في الذاكرة.
 *
 * صفحاتٌ يفتحها من لا حساب له (التسجيل، الدخول) تحتاج حدّاً، وإلّا كتب
 * فيها سكربتٌ آلاف الصفوف في دقيقة. والذاكرة تكفي هنا: خادمٌ واحد،
 * ومقهىً واحد، والحدّ يُبطئ الإساءة لا يمنع خصماً مصمّماً. ويُنسى عند
 * إعادة النشر — وهذا مقبول، فبديله جدولٌ يُكتب فيه عند كل محاولة.
 *
 * **ليس بديلاً عن الصلاحيات.** هو يمنع الكثرة لا يمنع من لا يحقّ له.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

/** تنظيفٌ كسول: بلا حذفٍ ينمو القاموس بعدد العناوين التي زارت يوماً. */
function sweep(now: number) {
  if (buckets.size < 500) return;
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}

export type RateResult = { ok: true } | { ok: false; retryInSeconds: number };

export function rateLimit(key: string, max: number, windowSeconds: number): RateResult {
  const now = Date.now();
  sweep(now);

  const b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return { ok: true };
  }
  if (b.count >= max) {
    return { ok: false, retryInSeconds: Math.ceil((b.resetAt - now) / 1000) };
  }
  b.count += 1;
  return { ok: true };
}

/** للاختبار فقط — يُفرّغ الدلاء بين الحالات. */
export function __resetThrottle() {
  buckets.clear();
}
