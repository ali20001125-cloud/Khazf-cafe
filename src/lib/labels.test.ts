import { describe, it, expect } from "vitest";
import { toBase, costToBase, inputUnit, costUnit } from "./labels";

describe("inputUnit — الكمية بوحدة الأساس نفسها", () => {
  it("غ · مل · حبة — بلا تحويل", () => {
    expect(inputUnit("g")).toEqual({ label: "غ", factor: 1 });
    expect(inputUnit("ml")).toEqual({ label: "مل", factor: 1 });
    expect(inputUnit("pcs")).toEqual({ label: "حبة", factor: 1 });
  });
});

describe("costUnit — التكلفة تبقى بالكبيرة", () => {
  it("كغ · لتر · حبة", () => {
    expect(costUnit("g")).toEqual({ label: "كغ", factor: 1000 });
    expect(costUnit("ml")).toEqual({ label: "لتر", factor: 1000 });
    expect(costUnit("pcs")).toEqual({ label: "حبة", factor: 1 });
  });
});

describe("toBase — الرقم المكتوب هو الرقم المحفوظ", () => {
  it("٥٠٠٠ تعني ٥٠٠٠ غراماً، لا خمسة كيلو مضروبةً بألف", () => {
    expect(toBase(5000, "g")).toBe(5000);
    expect(toBase(350, "g")).toBe(350);
    expect(toBase(1500, "ml")).toBe(1500);
    expect(toBase(12, "pcs")).toBe(12);
  });

  /**
   * الانحدار الذي كلّف ٤٥ كيلو وهمياً: كُتب `50` بقصد الغرامات فضُرب بألف.
   * اليوم ٥٠ تعني ٥٠ غراماً، فأسوأ ما يحدث خطأٌ بمقدار ما كُتب لا بألف ضعفه.
   */
  it("٥٠ تعني ٥٠ غراماً وليس ٥٠ كيلو", () => {
    expect(toBase(50, "g")).toBe(50);
  });

  it("الكسر يُقرَّب لصحيح — لا نصف غرام في الدفتر", () => {
    expect(toBase(5.4, "g")).toBe(5);
    expect(toBase(5.6, "g")).toBe(6);
  });
});

describe("costToBase — سعر الكيلو → سعر الغرام", () => {
  it("لا يتأثّر بتغيّر وحدة الكمية", () => {
    expect(costToBase(25000, "g")).toBe(25);
    expect(costToBase(1500, "ml")).toBe(2); // 1.5 → 2 (تقريب)
    expect(costToBase(250, "pcs")).toBe(250);
  });
});

describe("رحلة ذهاب-إياب للحبوب", () => {
  it("إدخال ٥٠٠٠غ بسعر ٢٥٬٠٠٠/كغ يُخزَّن ٥٠٠٠غ بتكلفة ٢٥/غ", () => {
    expect(toBase(5000, "g")).toBe(5000);
    expect(costToBase(25000, "g")).toBe(25);
  });
});
