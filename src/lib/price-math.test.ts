import { describe, it, expect } from "vitest";
import { bumpPrice } from "./price-math";

describe("bumpPrice", () => {
  it("يرفع بالنسبة", () => {
    expect(bumpPrice(3000, 10, 1)).toBe(3300);
    expect(bumpPrice(2500, 20, 1)).toBe(3000);
  });

  it("يخفض بالنسبة السالبة", () => {
    expect(bumpPrice(4000, -25, 1)).toBe(3000);
  });

  it("يقرّب إلى الدرجة — والفكّة هي السبب", () => {
    expect(bumpPrice(3000, 10, 250)).toBe(3250); // 3300 → 3250
    expect(bumpPrice(3000, 10, 500)).toBe(3500); // 3300 → 3500
    expect(bumpPrice(2500, 7, 100)).toBe(2700); // 2675 → 2700
  });

  it("لا يُنتج سعراً سالباً مهما بلغ الخفض", () => {
    expect(bumpPrice(1000, -200, 1)).toBe(0);
    expect(bumpPrice(1000, -200, 250)).toBe(0);
  });

  it("الصفر يبقى صفراً — النسبة من لا شيء لا شيء", () => {
    expect(bumpPrice(0, 50, 250)).toBe(0);
  });

  /**
   * الأهمّ: **التطبيق مرّتين لا يُضاعف.** الشاشة تحسب دائماً من السعر
   * المحفوظ لا من المسوّدة، فضغطتان على «طبّق» تعطيان ما تعطيه ضغطة.
   * هذا الاختبار يحرس تلك الخاصّية في الحساب نفسه.
   */
  it("الحساب من السعر الأصل ثابتٌ مهما تكرّر", () => {
    const base = 3000;
    const once = bumpPrice(base, 10, 250);
    const twice = bumpPrice(base, 10, 250);
    expect(twice).toBe(once);
    // ولو حُسب من الناتج لصار غير ذلك — وهذا ما نتجنّبه
    expect(bumpPrice(once, 10, 250)).not.toBe(once);
  });

  it("درجة أقلّ من واحد تعني بلا تقريب", () => {
    expect(bumpPrice(1234, 0, 0)).toBe(1234);
    expect(bumpPrice(1234, 0, 1)).toBe(1234);
  });
});
