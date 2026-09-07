import { describe, it, expect } from "vitest";
import { normalizePhone, maskPhone } from "./phone";

/**
 * توحيد رقم الهاتف هو **مفتاح حساب الولاء**: لو اختلف الشكل بين التسجيل
 * والبحث لصار للزبون حسابان وضاعت أختامه. لذلك يُختبر بدقّة.
 */

describe("normalizePhone", () => {
  it("يقبل الصيغة المحلية كما هي", () => {
    expect(normalizePhone("07701234567")).toBe("07701234567");
    expect(normalizePhone("07512345678")).toBe("07512345678");
  });

  it("يحوّل الصيغة الدولية إلى محلية", () => {
    expect(normalizePhone("9647701234567")).toBe("07701234567");
    expect(normalizePhone("+964 770 123 4567")).toBe("07701234567");
    expect(normalizePhone("00964 770 123 4567")).toBe("07701234567");
  });

  it("يضيف الصفر للرقم الناقص", () => {
    expect(normalizePhone("7701234567")).toBe("07701234567");
  });

  it("يتجاهل المسافات والشرطات والأقواس", () => {
    expect(normalizePhone("0770-123-4567")).toBe("07701234567");
    expect(normalizePhone("(0770) 123 4567")).toBe("07701234567");
    expect(normalizePhone(" 0770 123 4567 ")).toBe("07701234567");
  });

  it("يعطي نفس النتيجة لكل صيغ الرقم الواحد", () => {
    const forms = ["07701234567", "7701234567", "9647701234567", "+964-770-123-4567", "0770 123 4567"];
    const out = new Set(forms.map(normalizePhone));
    expect(out.size).toBe(1);
    expect([...out][0]).toBe("07701234567");
  });

  it("يرفض غير الصالح", () => {
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone("0770123456")).toBeNull();      // ناقص رقم
    expect(normalizePhone("077012345678")).toBeNull();    // زائد رقم
    expect(normalizePhone("06701234567")).toBeNull();     // لا يبدأ بـ07
    expect(normalizePhone("07201234567")).toBeNull();     // بادئة شبكة غير صالحة
    expect(normalizePhone("abcdefghijk")).toBeNull();
  });
});

describe("maskPhone", () => {
  it("يُخفي الوسط ويُبقي البداية والنهاية", () => {
    expect(maskPhone("07701234567")).toBe("0770****567");
  });

  it("لا يكشف أكثر من سبعة أرقام", () => {
    const masked = maskPhone("07701234567");
    const shown = masked.replace(/\D/g, "");
    expect(shown.length).toBeLessThanOrEqual(7);
  });
});
