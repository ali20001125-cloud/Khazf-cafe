import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

/**
 * اتصال قاعدة البيانات — الخادم فقط.
 *
 * Neon بلا واجهة HTTP عامة: لا مفتاح مجهول ولا نقطة REST مكشوفة.
 * الوصول الوحيد هو `DATABASE_URL`، وهو سرّ خادمي. الملف معلَّم
 * `server-only` فاستيراده من مكوّن متصفح يفشل البناء.
 *
 * الإنشاء كسول عمداً: البناء لا يجب أن ينهار لغياب المتغيّر.
 */
export function db(): NeonQueryFunction<false, false> {
  if (client) return client;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL غير مضبوط");
  client = neon(url);
  return client;
}
