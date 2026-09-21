/**
 * حساب السعر الجديد بعد نسبة، مقرَّباً.
 *
 * منفصلٌ عن الشاشة لأنه حسابُ مال: يُختبر وحده، ولا يُقرأ صوابه من
 * النظر إلى واجهة.
 *
 * والتقريب ليس تجميلاً. رفعُ ٣٬٠٠٠ عشرةً بالمئة يعطي ٣٬٣٠٠، وهذا سعرٌ
 * يُنهك الفكّة في درجٍ عملته ورقية. والتقريب إلى ٢٥٠ يعطي ٣٬٢٥٠ — رقمٌ
 * يُدفع ويُرَدّ عليه.
 */
export function bumpPrice(price: number, percent: number, step: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(percent)) return price;
  const raw = price * (1 + percent / 100);
  if (!(step > 1)) return Math.max(0, Math.round(raw));
  return Math.max(0, Math.round(raw / step) * step);
}
