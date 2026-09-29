import { describe, expect, it } from "vitest";
import { joinIngredients, splitIngredients } from "./ingredients";

describe("splitIngredients", () => {
  it("splits on the middle dot, commas and new lines", () => {
    expect(splitIngredients("إسبريسو · حليب مبخّر، رغوة\nثلج")).toEqual([
      "إسبريسو",
      "حليب مبخّر",
      "رغوة",
      "ثلج",
    ]);
  });
  it("drops blanks and duplicates", () => {
    expect(splitIngredients(" · إسبريسو ·· إسبريسو , ")).toEqual(["إسبريسو"]);
  });
  it("is empty for nothing", () => {
    expect(splitIngredients(null)).toEqual([]);
    expect(splitIngredients("")).toEqual([]);
  });
});

describe("joinIngredients", () => {
  it("normalises to one separator", () => {
    expect(joinIngredients("Espresso, Steamed milk")).toBe("Espresso · Steamed milk");
  });
});
