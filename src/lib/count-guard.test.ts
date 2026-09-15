import { describe, it, expect } from "vitest";
import { isSuspiciousCount } from "./count-guard";

/** مثال المالك: رصيد ٦٠٠٠، بيع ٤٠٠ غ ⇒ المتوقّع ٥٬٦٠٠. */
const sale = { expected: 5600, moved: 400 };

describe("حارس الجرد — يُقاس على الحركة لا على الإشارة", () => {
  it("العدّ الصحيح يمرّ", () => {
    expect(isSuspiciousCount({ ...sale, counted: 5600 })).toBe(false);
  });

  it("فرقٌ بحجم الحركة يمرّ — هذا هو النقص الطبيعي", () => {
    expect(isSuspiciousCount({ ...sale, counted: 5300 })).toBe(false);
    expect(isSuspiciousCount({ ...sale, counted: 5900 })).toBe(false);
  });

  /**
   * الأخطاء الثلاثة التي ساقها المالك. قاعدة «ارفض كل زيادة» تمسك
   * الأوّل وحده؛ ومسطرة الحركة تمسك الثلاثة.
   */
  it("صفرٌ زائد — 56000 بدل 5600", () => {
    expect(isSuspiciousCount({ ...sale, counted: 56000 })).toBe(true);
  });

  it("رقمٌ أقلّ بكثير — 4500 (وهو **نقص**، تفوته قاعدة الإشارة)", () => {
    expect(isSuspiciousCount({ ...sale, counted: 4500 })).toBe(true);
  });

  it("صفرٌ ناقص — 560 (نقصٌ أيضاً، تفوته قاعدة الإشارة)", () => {
    expect(isSuspiciousCount({ ...sale, counted: 560 })).toBe(true);
  });

  /**
   * ولا تمنع الصحيح: بنٌّ بقي في المطحنة ولم يُعدّ أمس فظهر اليوم.
   * زيادةٌ صغيرة ضمن حدود ما تحرّك — تمرّ، ويبقى الفرق مسجّلاً.
   */
  it("زيادةٌ صغيرة مشروعة تمرّ — لا تُمنع لأنها موجبة", () => {
    expect(isSuspiciousCount({ ...sale, counted: 5750 })).toBe(false);
  });

  it("الزيادة الكبيرة تقف — حتى لو كانت زيادة", () => {
    expect(isSuspiciousCount({ ...sale, counted: 12000 })).toBe(true);
  });

  it("بلا حركةٍ مسجّلة يرجع لنسبةٍ من الرصيد", () => {
    expect(isSuspiciousCount({ expected: 6000, moved: 0, counted: 5800 })).toBe(false);
    expect(isSuspiciousCount({ expected: 6000, moved: 0, counted: 60000 })).toBe(true);
  });
});
