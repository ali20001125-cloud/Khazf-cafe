import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetThrottle } from "./throttle";

describe("rateLimit — يُبطئ الإساءة على الصفحات المكشوفة", () => {
  beforeEach(() => __resetThrottle());

  it("يسمح حتى الحدّ ثم يمنع", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("a", 3, 60).ok).toBe(true);
    expect(rateLimit("a", 3, 60).ok).toBe(false);
  });

  it("يقول كم يبقى من الانتظار", () => {
    rateLimit("b", 1, 60);
    const r = rateLimit("b", 1, 60);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.retryInSeconds).toBeGreaterThan(0);
  });

  // مفتاحٌ واحد لجهازٍ واحد: منع جهازٍ يجب ألّا يمنع سواه
  it("المفاتيح مستقلّة", () => {
    for (let i = 0; i < 3; i++) rateLimit("x", 3, 60);
    expect(rateLimit("x", 3, 60).ok).toBe(false);
    expect(rateLimit("y", 3, 60).ok).toBe(true);
  });

  it("النافذة تنتهي فيُسمح من جديد", () => {
    expect(rateLimit("z", 1, 0).ok).toBe(true);
    // نافذةٌ بصفر ثانية منتهيةٌ فوراً
    expect(rateLimit("z", 1, 0).ok).toBe(true);
  });
});
