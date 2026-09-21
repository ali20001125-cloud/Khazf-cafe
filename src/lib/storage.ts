import "server-only";
import { createHash, randomBytes } from "crypto";
import aws4 from "aws4";

/**
 * تخزين صور المنيو على Neon Storage.
 *
 * **لماذا لا داخل القاعدة؟** الصور تُقرأ مع كل فتحة منيو، ومرورها عبر
 * الخادم في كل مرّة يُحمّله ما لا يلزمه. والدلو عامّ القراءة، فتذهب
 * الصورة من التخزين إلى هاتف الزبون مباشرةً.
 *
 * **ولماذا لا ملفّات على القرص؟** استضافة المالك مشتركة: ما يُكتب على
 * قرصها يُمحى مع كل نشر. فصورةٌ رُفعت اليوم تختفي بعد أوّل تحديث.
 *
 * والتوقيع بمكتبة `aws4` لا بيدي: SigV4 تعميةٌ دقيقة، وخطأٌ في ترتيب
 * ترويسةٍ واحدة يُنتج رفضاً لا يُفهم سببه. والمكتبة ملفٌّ واحد بلا
 * تبعيّات، مجرَّبةٌ في آلاف المشاريع.
 */

const ENDPOINT = (process.env.NEON_S3_ENDPOINT ?? "").replace(/\/+$/, "");
const BUCKET = process.env.NEON_S3_BUCKET ?? "";
const KEY = process.env.NEON_S3_KEY ?? "";
const SECRET = process.env.NEON_S3_SECRET ?? "";
const REGION = process.env.NEON_S3_REGION ?? "eu-central-1";

export function storageConfigured(): boolean {
  return Boolean(ENDPOINT && BUCKET && KEY && SECRET);
}

/**
 * نوع الصورة من **بايتاتها** لا من اسمها.
 *
 * `content-type` الذي يُرسله المتصفّح يكتبه المتصفّح، ومن أرسل الطلب
 * بيده يكتب ما شاء. فالفحص على التوقيع الثنائي: من زعم صورةً وأرسل
 * سكربتاً لا يمرّ.
 */
export function sniffImage(bytes: Uint8Array): { ok: true; type: string; ext: string } | { ok: false } {
  const b = bytes;
  if (b.length > 12) {
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ok: true, type: "image/jpeg", ext: "jpg" };
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47)
      return { ok: true, type: "image/png", ext: "png" };
    // RIFF....WEBP
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
        b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50)
      return { ok: true, type: "image/webp", ext: "webp" };
  }
  return { ok: false };
}

/** مفتاحٌ جديد لكل رفع: تغييرُ الصورة على المفتاح نفسه يُبقي القديمة في ذاكرة المتصفّحات. */
export function imageKey(productId: string, ext: string): string {
  return `products/${productId}/${randomBytes(8).toString("hex")}.${ext}`;
}

export type PutResult = { ok: true; url: string } | { ok: false; error: string };

export async function putImage(
  key: string,
  bytes: Uint8Array,
  contentType: string
): Promise<PutResult> {
  if (!storageConfigured()) return { ok: false, error: "التخزين غير مضبوط" };

  const url = new URL(`${ENDPOINT}/${BUCKET}/${key}`);
  const body = Buffer.from(bytes);

  const signed = aws4.sign(
    {
      host: url.host,
      path: url.pathname,
      method: "PUT",
      service: "s3",
      region: REGION,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        // S3 يطلبها صراحةً، ولا تُحسب من الجسم تلقائياً
        "X-Amz-Content-Sha256": createHash("sha256").update(body).digest("hex"),
      },
      body,
    },
    { accessKeyId: KEY, secretAccessKey: SECRET }
  );

  try {
    const res = await fetch(url.toString(), {
      method: "PUT",
      headers: signed.headers as Record<string, string>,
      body,
    });
    if (!res.ok) {
      const text = (await res.text().catch(() => "")).slice(0, 300);
      return { ok: false, error: `رفض التخزين (${res.status}) ${text}` };
    }
    return { ok: true, url: url.toString() };
  } catch {
    return { ok: false, error: "تعذّر الوصول إلى التخزين" };
  }
}

/**
 * حذف صورةٍ قديمة بعد استبدالها.
 *
 * فشله لا يُفشل شيئاً: الصورة الجديدة محفوظة والمنتج يشير إليها، وبقاء
 * ملفٍّ يتيمٍ في الدلو أهون من رسالة خطأ للمالك عن شيءٍ أتمّه بنجاح.
 */
export async function deleteImage(publicUrl: string): Promise<void> {
  if (!storageConfigured()) return;
  if (!publicUrl.startsWith(`${ENDPOINT}/${BUCKET}/`)) return;

  const url = new URL(publicUrl);
  const signed = aws4.sign(
    {
      host: url.host,
      path: url.pathname,
      method: "DELETE",
      service: "s3",
      region: REGION,
      headers: { "X-Amz-Content-Sha256": createHash("sha256").update("").digest("hex") },
    },
    { accessKeyId: KEY, secretAccessKey: SECRET }
  );
  try {
    await fetch(url.toString(), { method: "DELETE", headers: signed.headers as Record<string, string> });
  } catch {
    /* ملفٌّ يتيم أهون من عمليةٍ تفشل بعد نجاحها */
  }
}
