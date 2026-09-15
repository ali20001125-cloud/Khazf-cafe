/**
 * ثوابت العرض المشتركة.
 *
 * تسميات أحداث التدقيق ليست هنا بل في `events.ts` — لأنها تحتاج مع الاسم
 * «لماذا يهمّك» ودرجة الأهمية، وقائمتان للأسماء نفسها تفترقان مع الوقت.
 */

export const WASTE_REASONS: { value: string; label: string }[] = [
  { value: "dial_in", label: "معايرة" },
  { value: "spill", label: "سكب" },
  { value: "prep_error", label: "خطأ تحضير" },
  { value: "expired", label: "منتهي" },
  { value: "damaged", label: "تالف" },
  { value: "cleaning", label: "تنظيف" },
  { value: "other", label: "أخرى" },
];

/**
 * وحدة إدخال **الكميات**: وحدة الأساس نفسها، بلا تحويل.
 *
 * كانت بالكيلو (×1000)، فصار على المالك أن يكتب `5.82` ليقصد ٥٨٢٠ غراماً.
 * وهو يفكّر بالغرام: «بعنا اليوم ٣٥٠ غ»، «بقي ٥٤٢٠». فكتب `50` يقصد
 * غرامات، فقرأها النظام ٥٠ كيلو وسوّى الرصيد على ٥٠٬٠٠٠ — قفزةٌ ٨١٥٪
 * قبلها بصمت. الكسر العشري هو الفخّ: يومٌ نبيع ٣٥٠ غ ويومٌ ربع كيلو،
 * فلا رقم مستقرّ يُكتب بالكيلو بلا فاصلة.
 *
 * فالكمية الآن تُكتب كما تُقاس: بالغرام والمليلتر والحبّة، أعداداً صحيحة.
 */
export function inputUnit(base: string): { label: string; factor: number } {
  if (base === "g") return { label: "غ", factor: 1 };
  if (base === "ml") return { label: "مل", factor: 1 };
  return { label: "حبة", factor: 1 };
}

export function toBase(displayValue: number, base: string): number {
  return Math.round(displayValue * inputUnit(base).factor);
}

/**
 * وحدة إدخال **التكلفة** — تبقى الكبيرة (كغ/لتر).
 *
 * لأن الأسعار تُقال هكذا: «الكيلو بـ٣٠ ألفاً»، لا «الغرام بـ٣٠». وسعرُ
 * الغرام كسرٌ في الغالب، فإدخاله يخسر دقّةً لا يملكها الدينار أصلاً.
 */
export function costUnit(base: string): { label: string; factor: number } {
  if (base === "g") return { label: "كغ", factor: 1000 };
  if (base === "ml") return { label: "لتر", factor: 1000 };
  return { label: "حبة", factor: 1 };
}

/** التكلفة تُدخل لكل كغ/لتر/حبة وتُحوَّل لكل وحدة أساس. */
export function costToBase(displayCost: number, base: string): number {
  return Math.round(displayCost / costUnit(base).factor);
}
