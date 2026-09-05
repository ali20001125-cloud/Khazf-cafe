import { describe, it, expect } from "vitest";
import { toBase, costToBase, inputUnit } from "./labels";

describe("inputUnit — وحدة الإدخال المريحة", () => {
  it("غرام→كغ · مل→لتر · قطعة→حبة", () => {
    expect(inputUnit("g")).toEqual({ label: "كغ", factor: 1000 });
    expect(inputUnit("ml")).toEqual({ label: "لتر", factor: 1000 });
    expect(inputUnit("pcs")).toEqual({ label: "حبة", factor: 1 });
  });
});

describe("toBase — تحويل الكمية للوحدة الأساس", () => {
  it("يحوّل الكيلو/اللتر للأساس", () => {
    expect(toBase(5, "g")).toBe(5000); // 5 كغ
    expect(toBase(1.5, "ml")).toBe(1500); // 1.5 لتر
    expect(toBase(12, "pcs")).toBe(12);
  });
});

describe("costToBase — تحويل التكلفة لكل وحدة أساس", () => {
  it("سعر الكيلو → سعر الغرام", () => {
    expect(costToBase(25000, "g")).toBe(25); // 25000/كغ → 25/غم
    expect(costToBase(1500, "ml")).toBe(2); // 1500/لتر → 1.5 → 2 (تقريب)
    expect(costToBase(250, "pcs")).toBe(250);
  });
});

describe("رحلة ذهاب-إياب للحبوب", () => {
  it("إدخال ٥كغ بسعر ٢٥٬٠٠٠/كغ يُخزَّن ٥٠٠٠غ بتكلفة ٢٥/غ", () => {
    expect(toBase(5, "g")).toBe(5000);
    expect(costToBase(25000, "g")).toBe(25);
  });
});
