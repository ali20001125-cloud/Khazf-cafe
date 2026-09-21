import { describe, it, expect } from "vitest";
import { bannerLive, readBanner, dayKey, type Banner } from "./banner";

const at = (iso: string) => new Date(iso);

describe("bannerLive", () => {
  const b = (o: Partial<Banner> = {}): Banner => ({
    text: "مشروب اليوم: موكا",
    tone: "news",
    until: null,
    ...o,
  });

  it("بلا تاريخ يبقى", () => {
    expect(bannerLive(b(), at("2026-09-21T10:00:00Z"))).toBe(true);
  });

  it("لا شريط بلا نصّ", () => {
    expect(bannerLive(b({ text: "   " }), at("2026-09-21T10:00:00Z"))).toBe(false);
    expect(bannerLive(null, at("2026-09-21T10:00:00Z"))).toBe(false);
  });

  it("يظهر في يومه الأخير كلّه — لا حتى فجره", () => {
    const x = b({ until: "2026-09-21" });
    expect(bannerLive(x, at("2026-09-21T04:00:00Z"))).toBe(true);
    // ٢٠:٠٠ بغداد في اليوم نفسه
    expect(bannerLive(x, at("2026-09-21T17:00:00Z"))).toBe(true);
  });

  it("يصمت وحده بعد يومه", () => {
    const x = b({ until: "2026-09-21" });
    expect(bannerLive(x, at("2026-09-22T05:00:00Z"))).toBe(false);
  });

  /**
   * الخادم في أوروبا والمحلّ في بغداد. الساعة ٢٢:٠٠ في بغداد هي ١٩:٠٠
   * بتوقيت غرينتش من **اليوم نفسه** — لكن ٠١:٠٠ بغداد هي ٢٢:٠٠ من
   * اليوم **السابق**. ولو قُرئ اليوم بتوقيت الخادم لصمت الشريط قبل
   * أوانه أو بقي بعده.
   */
  it("اليوم بتوقيت بغداد لا بتوقيت الخادم", () => {
    // ٢٢:٠٠ بغداد يوم ٢١ = ١٩:٠٠ UTC يوم ٢١
    expect(dayKey(at("2026-09-21T19:00:00Z"))).toBe("2026-09-21");
    // ٠١:٠٠ بغداد يوم ٢٢ = ٢٢:٠٠ UTC يوم ٢١ — وهو يومٌ جديد في بغداد
    expect(dayKey(at("2026-09-21T22:00:00Z"))).toBe("2026-09-22");

    const x = b({ until: "2026-09-21" });
    expect(bannerLive(x, at("2026-09-21T19:00:00Z"))).toBe(true);
    expect(bannerLive(x, at("2026-09-21T22:00:00Z"))).toBe(false);
  });
});

describe("readBanner", () => {
  it("يقرأ الشريط الكامل", () => {
    expect(
      readBanner({ menu_banner_text: "جديد", menu_banner_tone: "warn", menu_banner_until: "2026-10-01" })
    ).toEqual({ text: "جديد", tone: "warn", until: "2026-10-01" });
  });

  it("لا يثق بما هو مخزَّن: نبرةٌ غريبة تعود عادية، وتاريخٌ مشوّه يُهمَل", () => {
    const r = readBanner({
      menu_banner_text: "جديد",
      menu_banner_tone: "أزرق",
      menu_banner_until: "قريباً",
    });
    expect(r).toEqual({ text: "جديد", tone: "news", until: null });
  });

  it("نصٌّ فارغ أو مفقود يعني لا شريط", () => {
    expect(readBanner({})).toBeNull();
    expect(readBanner({ menu_banner_text: "  " })).toBeNull();
    expect(readBanner({ menu_banner_text: 42 })).toBeNull();
  });
});
