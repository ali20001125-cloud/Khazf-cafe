import { describe, it, expect } from "vitest";
import { money, num, stockLabel, baseQtyLabel, countAr, unitLabel, drinksLabel, kindName } from "./format";

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

describe("drinksLabel — ترجمة النقص إلى مشروبات", () => {
  it("يصوغ الجمع العربي صواباً", () => {
    expect(drinksLabel(1)).toBe("مشروب واحد");
    expect(drinksLabel(2)).toBe("مشروبين");
    expect(drinksLabel(3)).toBe("3 مشروبات");
    expect(drinksLabel(10)).toBe("10 مشروبات");
    expect(drinksLabel(13)).toBe("13 مشروباً");
  });
  it("يقرّب الكسر لأقرب مشروب", () => {
    expect(drinksLabel(3.6)).toBe("4 مشروبات"); // ٥٤٠مل ÷ ١٥٠
    expect(drinksLabel(2.4)).toBe("مشروبين");
  });
  it("ما دون المشروب الواحد لا يُسمّى صفراً", () => {
    expect(drinksLabel(0.3)).toBe("أقلّ من مشروب");
    expect(drinksLabel(0)).toBe("أقلّ من مشروب");
  });
});

describe("unitLabel", () => {
  it("يترجم الوحدات", () => {
    expect(unitLabel("g")).toBe("غم");
    expect(unitLabel("ml")).toBe("مل");
    expect(unitLabel("pcs")).toBe("حبة");
  });
});

describe("stockLabel — الكسر لا يُقرَّب للصحيح", () => {
  it("٥٬٥٠٠ غم = ٥٫٥ كغ، لا ٦", () => {
    expect(stockLabel(5500, "g")).toBe("5.5 كغ");
  });
  it("٤٬٥٣٢ غم = ٤٫٥ كغ — كان يُعرض «٥ كغ»، كذبةً بـ٤٦٨ غم (٢٦ مشروباً)", () => {
    expect(stockLabel(4532, "g")).toBe("4.5 كغ");
  });
  it("١١٬٨٥٠ مل = ١١٫٩ لتر، لا ١٢", () => {
    expect(stockLabel(11850, "ml")).toBe("11.9 لتر");
  });
  it("الرقم الصحيح يبقى بلا كسرٍ زائد", () => {
    expect(stockLabel(5000, "g")).toBe("5 كغ");
    expect(stockLabel(12000, "ml")).toBe("12 لتر");
  });
  it("ما دون الألف يبقى بوحدته الأساس", () => {
    expect(stockLabel(900, "g")).toBe("900 غم");
    expect(stockLabel(267, "pcs")).toBe("267 حبة");
  });
});

describe("baseQtyLabel — الرقم كما هو، ليُقاس عليه", () => {
  it("لا يقرّب ولا يحوّل", () => {
    expect(baseQtyLabel(5460, "g")).toBe("5,460 غ");
    expect(baseQtyLabel(49980, "g")).toBe("49,980 غ");
    expect(baseQtyLabel(200, "ml")).toBe("200 مل");
    expect(baseQtyLabel(12, "pcs")).toBe("12 حبة");
  });

  /**
   * ٤٩٬٩٨٠ تُعرض «50 كغ» في `stockLabel`، فيكتب المالك 50 ويصنع فرقاً
   * وهمياً. الفرق بين الدالّتين هو الفرق بين تصفّحٍ ومقياس.
   */
  it("يختلف عن stockLabel حيث يُقاس عليه", () => {
    expect(stockLabel(49980, "g")).toBe("50 كغ");
    expect(baseQtyLabel(49980, "g")).toBe("49,980 غ");
  });
});

describe("countAr — الجمع العربي لا الترجمة الآليّة", () => {
  it("واحد · اثنان · ٣-١٠ جمع · ١١+ مفرد منصوب", () => {
    expect(countAr(1, "كوباً", "كوبين", "أكواب")).toBe("كوباً");
    expect(countAr(2, "كوباً", "كوبين", "أكواب")).toBe("كوبين");
    expect(countAr(6, "كوباً", "كوبين", "أكواب")).toBe("6 أكواب");
    expect(countAr(20, "كوباً", "كوبين", "أكواب")).toBe("20 كوباً");
  });

  it("baseQtyLabel يجمع الحبّات صحيحاً", () => {
    expect(baseQtyLabel(1, "pcs")).toBe("حبة");
    expect(baseQtyLabel(3, "pcs")).toBe("3 حبات");
    expect(baseQtyLabel(297, "pcs")).toBe("297 حبة");
  });

  it("drinksLabel لم يتغيّر سلوكه", () => {
    expect(drinksLabel(1)).toBe("مشروب واحد");
    expect(drinksLabel(5)).toBe("5 مشروبات");
    expect(drinksLabel(26)).toBe("26 مشروباً");
  });
});

describe("kindName — النوع كما يُقرأ لا كما يُخزَّن", () => {
  it("يُسقط لاحقة «للبيع» وبادئة «حبوب/بن»", () => {
    expect(kindName("بن كالدي — للبيع")).toBe("كالدي");
    expect(kindName("حبوب سيرادو")).toBe("سيرادو");
    expect(kindName("بن الدورادو — للبيع")).toBe("الدورادو");
  });

  it("لا يمسّ ما ليس محصولاً", () => {
    expect(kindName("كوب سيراميك")).toBe("كوب سيراميك");
    expect(kindName("حليب شوفان")).toBe("حليب شوفان");
  });

  // «بن» وحدها اسمٌ كامل: إسقاط البادئة يُفرغ النصّ، والفراغ أسوأ من
  // الاسم الأصلي — فالاسم يعود كما هو
  it("لا يُفرغ اسماً من محتواه", () => {
    expect(kindName("بن")).toBe("بن");
    expect(kindName("حبوب")).toBe("حبوب");
    // اللاحقة تسقط والبادئة تبقى: «حبوب» بلا ما بعدها ليست بادئة
    expect(kindName("حبوب — للبيع")).toBe("حبوب");
  });
});
