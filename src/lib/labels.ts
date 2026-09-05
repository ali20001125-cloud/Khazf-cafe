/** ثوابت العرض المشتركة (تُستعمل في الواجهة). */

export const WASTE_REASONS: { value: string; label: string }[] = [
  { value: "dial_in", label: "معايرة" },
  { value: "spill", label: "سكب" },
  { value: "prep_error", label: "خطأ تحضير" },
  { value: "expired", label: "منتهي" },
  { value: "damaged", label: "تالف" },
  { value: "cleaning", label: "تنظيف" },
  { value: "other", label: "أخرى" },
];

/** تسميات أحداث سجلّ التدقيق (للوحة المالك). */
export function auditActionLabel(action: string): string {
  const map: Record<string, string> = {
    login: "دخول",
    logout: "خروج",
    login_locked: "قفل حساب (محاولات خاطئة)",
    open_shift: "فتح وردية",
    close_shift: "إغلاق وردية",
    cash_drop: "سحب نقد",
    record_waste: "هدر",
    add_stock: "إضافة مخزون",
    stock_count: "جرد",
    void_paid: "إلغاء بعد الدفع",
    refund: "إرجاع",
    apply_discount: "خصم",
    day_close: "إغلاق اليوم",
    pos_lock: "قفل الكاشير",
  };
  return map[action] ?? action;
}

/**
 * وحدة الإدخال المريحة لكل وحدة أساس:
 *  - غرام → كيلوغرام (×1000)
 *  - مل → لتر (×1000)
 *  - حبة → حبة (×1)
 * تُدخل الكميات بوحدة العرض وتُحوَّل للأساس قبل الإرسال.
 */
export function inputUnit(base: string): { label: string; factor: number } {
  if (base === "g") return { label: "كغ", factor: 1000 };
  if (base === "ml") return { label: "لتر", factor: 1000 };
  return { label: "حبة", factor: 1 };
}

export function toBase(displayValue: number, base: string): number {
  return Math.round(displayValue * inputUnit(base).factor);
}

/** التكلفة تُدخل لكل وحدة عرض (لكل كغ/لتر/حبة) وتُحوَّل لكل وحدة أساس. */
export function costToBase(displayCost: number, base: string): number {
  return Math.round(displayCost / inputUnit(base).factor);
}
