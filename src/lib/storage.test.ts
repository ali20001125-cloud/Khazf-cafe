import { describe, it, expect } from "vitest";
import { sniffImage, imageKey } from "./storage";

/**
 * الفحص على البايتات لا على الاسم.
 *
 * `content-type` يكتبه المرسِل، والامتداد يكتبه المرسِل، فكلاهما يُزوَّر
 * في سطر. أمّا التوقيع الثنائي فهو في الملفّ نفسه: من أرسل سكربتاً
 * وسمّاه `photo.jpg` لا يمرّ.
 */
const jpg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0]);
const png = () =>
  new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73]);
const webp = () => {
  const b = new Uint8Array(20);
  b.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  b.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  return b;
};

describe("sniffImage", () => {
  it("يقبل JPG و PNG و WebP", () => {
    expect(sniffImage(jpg())).toEqual({ ok: true, type: "image/jpeg", ext: "jpg" });
    expect(sniffImage(png())).toEqual({ ok: true, type: "image/png", ext: "png" });
    expect(sniffImage(webp())).toEqual({ ok: true, type: "image/webp", ext: "webp" });
  });

  it("يرفض ملفّاً نصّياً وإن سُمّي صورة", () => {
    const script = new TextEncoder().encode("<script>alert(1)</script>xxxx");
    expect(sniffImage(script).ok).toBe(false);
  });

  it("يرفض RIFF ليس WebP — صوت WAV يبدأ بالبادئة نفسها", () => {
    const wav = new Uint8Array(20);
    wav.set([0x52, 0x49, 0x46, 0x46], 0);
    wav.set([0x57, 0x41, 0x56, 0x45], 8); // WAVE
    expect(sniffImage(wav).ok).toBe(false);
  });

  it("يرفض ملفّاً أقصر من أن يحمل توقيعاً", () => {
    expect(sniffImage(new Uint8Array([0xff, 0xd8, 0xff])).ok).toBe(false);
    expect(sniffImage(new Uint8Array()).ok).toBe(false);
  });
});

describe("imageKey", () => {
  it("مفتاحٌ جديد لكل رفع — وإلّا بقيت القديمة في ذاكرة المتصفّحات", () => {
    const a = imageKey("p1", "jpg");
    const b = imageKey("p1", "jpg");
    expect(a).not.toBe(b);
    expect(a.startsWith("products/p1/")).toBe(true);
    expect(a.endsWith(".jpg")).toBe(true);
  });
});
