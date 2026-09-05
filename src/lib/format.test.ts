import { describe, it, expect } from "vitest";
import { money, num, stockLabel, unitLabel } from "./format";

describe("money — أرقام إنجليزية بلا كسور", () => {
  it("يُنسّق بفواصل إنجليزية مع العملة", () => {
    expect(money(3000)).toBe("3,000 د.ع");
    expect(money(0)).toBe("0 د.ع");
    expect(money(1234567, "IQD")).toBe("1,234,567 IQD");
  });
  it("يقرّب لأقرب دينار (بلا كسور)", () => {
    expect(money(2500.6)).toBe("2,501 د.ع");
  });
  it("لا يستخدم الأرقام العربية الهندية", () => {
    expect(money(3000)).not.toMatch(/[٠-٩]/);
    expect(num(1000)).toBe("1,000");
  });
});

describe("stockLabel — تحويل الوحدات للعرض", () => {
  it("غرام يتحوّل لكيلو عند الكبر", () => {
    expect(stockLabel(5000, "g")).toBe("5 كغ");
    expect(stockLabel(4955, "g")).toBe("5 كغ"); // تقريب لعشر
    expect(stockLabel(500, "g")).toBe("500 غم");
  });
  it("مل يتحوّل للتر عند الكبر", () => {
    expect(stockLabel(12000, "ml")).toBe("12 لتر");
    expect(stockLabel(200, "ml")).toBe("200 مل");
  });
  it("القطع تبقى حبّات", () => {
    expect(stockLabel(300, "pcs")).toBe("300 حبة");
  });
});

describe("unitLabel", () => {
  it("يترجم الوحدات", () => {
    expect(unitLabel("g")).toBe("غم");
    expect(unitLabel("ml")).toBe("مل");
    expect(unitLabel("pcs")).toBe("حبة");
  });
});
