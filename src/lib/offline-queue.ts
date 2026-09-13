"use client";

/**
 * طابور البيع المحلّي (§21 · §65).
 *
 * حين تغيب الشبكة يُتمّ الكاشير البيع ويحفظه هنا، ثم يُرفع حين تعود. ثلاث
 * قواعد تحكم هذا الملفّ:
 *
 * ١. **لا يُحذف بيع إلا بعد تأكيد الخادم.** لا عند الإرسال، ولا عند الخطأ.
 *    فقدان فاتورة أسوأ من تكرار محاولة.
 * ٢. **المفتاح الفريد يُولَّد مرّة** ويبقى مع البيع طول رحلته. إعادة الرفع
 *    بنفس المفتاح لا تُنتج فاتورة ثانية — القاعدة تردّ الأولى (§21).
 * ٣. **الوقت يُحفظ لحظة البيع** لا لحظة الرفع. بيعٌ تمّ ١١ ليلاً ورُفع ٨
 *    صباحاً يجب أن يبقى في ليلته: يومه المحاسبي ووردية درجه.
 *
 * التخزين `localStorage` وهو متزامن عمداً: الكتابة تكتمل قبل أن يرى
 * الباريستا الإيصال، فلا يظهر إيصالٌ لبيعٍ لم يُحفظ.
 */

const KEY = "khazaf.pending_sales.v1";

export type QueuedSale = {
  /** مفتاح المنع المزدوج — يُولَّد مرّة ولا يتغيّر */
  idempotencyKey: string;
  /** لحظة البيع الحقيقية (ISO) */
  occurredAt: string;
  shiftId: string;
  items: { product_id: string; crop_material_id: string; qty: number; options: string[] }[];
  fulfillment: "takeaway" | "dine_in";
  method: "cash" | "card";
  tendered: number | null;
  total: number;
  customerId: string | null;
  /** رقم محلّي يراه الباريستا ريثما يصل رقم الفاتورة الحقيقي */
  localRef: number;
  attempts: number;
  /** آخر سبب رفض من الخادم — يُعرض ولا يُبتلع */
  lastError: string | null;
};

function read(): QueuedSale[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as QueuedSale[]) : [];
  } catch {
    return [];
  }
}

function write(list: QueuedSale[]): boolean {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

export function pending(): QueuedSale[] {
  return read();
}

export function pendingCount(): number {
  return read().length;
}

/** الرقم المحلّي التالي — يستمرّ عبر إعادة التشغيل ولا يُعاد استعماله. */
function nextLocalRef(list: QueuedSale[]): number {
  const stored = Number(window.localStorage.getItem(KEY + ".ref") || 0);
  const fromList = list.reduce((m, s) => Math.max(m, s.localRef), 0);
    const next = Math.max(stored, fromList) + 1;
  try {
    window.localStorage.setItem(KEY + ".ref", String(next));
  } catch {
    /* الرقم المحلّي راحة عرض، لا تُفشل البيع لأجله */
  }
  return next;
}

/**
 * يضيف بيعاً للطابور. يُرجع الصفّ المحفوظ، أو `null` إذا تعذّر الحفظ —
 * وعندها **لا يُعرض إيصال**: بيعٌ لم يُحفظ لم يقع.
 */
export function enqueue(
  sale: Omit<QueuedSale, "localRef" | "attempts" | "lastError">
): QueuedSale | null {
  const list = read();
  if (list.some((s) => s.idempotencyKey === sale.idempotencyKey)) {
    return list.find((s) => s.idempotencyKey === sale.idempotencyKey) ?? null;
  }
  const row: QueuedSale = { ...sale, localRef: nextLocalRef(list), attempts: 0, lastError: null };
  return write([...list, row]) ? row : null;
}

/** يُزال بعد تأكيد الخادم وحده. */
export function remove(idempotencyKey: string): void {
  write(read().filter((s) => s.idempotencyKey !== idempotencyKey));
}

/** يُسجّل محاولةً فاشلة ويُبقي البيع في الطابور. */
export function markFailed(idempotencyKey: string, error: string): void {
  write(
    read().map((s) =>
      s.idempotencyKey === idempotencyKey
        ? { ...s, attempts: s.attempts + 1, lastError: error }
        : s
    )
  );
}
