"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import DrinkArt, { artKind } from "./DrinkArt";
import {
  removeProductImageAction,
  uploadProductImageAction,
} from "@/app/manage/menu-actions";

/**
 * صورة المنتج — تُلتقط أو تُختار من الهاتف.
 *
 * **تُصغَّر قبل أن تُرسل.** صورة هاتفٍ حديث أربعة ميغابايت أو أكثر،
 * وهي تُعرض في مربّعٍ عرضه أصابع. رفعها كما هي يُبطئ المالك على شبكته،
 * ثمّ يُبطئ كل زبونٍ يفتح المنيو بعده على شبكته هو. فالتصغير في
 * المتصفّح إلى ١٢٠٠ بكسل و**جودة ٠٫٨**: فرقٌ لا تراه العين في هذا
 * الحجم، وحمولةٌ تُقسَم إلى عُشر.
 *
 * ولا يُرفع شيءٌ قبل أن يُرى: المعاينة تظهر فور الاختيار، فمن التقط
 * صورةً مائلة يعرف قبل أن ينتظر الرفع.
 */
const MAX_EDGE = 1200;
const QUALITY = 0.8;

async function shrink(file: File): Promise<Blob> {
  // PNG قد يكون شفّافاً، وتحويله إلى JPEG يملأ الشفافية بالأسود.
  // فالشفّاف يُترك كما هو ما دام صغيراً.
  const keepAsIs = file.type === "image/png" && file.size < 400_000;
  if (keepAsIs) return file;

  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;

  const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/jpeg", QUALITY)
  );
  // لو خرج المصغَّر أكبر من الأصل (يقع مع الصور الصغيرة) فالأصل أولى
  return blob && blob.size < file.size ? blob : file;
}

export default function ImageField({
  productId,
  productName,
  category,
  kind,
  imageUrl,
  disabled,
}: {
  productId: string;
  productName: string;
  category: string;
  kind: "drink" | "retail";
  imageUrl: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shown = preview ?? imageUrl;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // كي يعمل اختيار الملفّ نفسه مرّةً ثانية
    if (!file) return;

    setError(null);
    const local = URL.createObjectURL(file);
    setPreview(local);
    setBusy(true);
    try {
      const small = await shrink(file);
      const fd = new FormData();
      fd.append("file", small, "photo.jpg");
      const r = await uploadProductImageAction(productId, fd);
      if (!r.ok) {
        setError(r.error);
        setPreview(null);
      } else {
        setPreview(r.url);
        router.refresh();
      }
    } catch {
      setError("تعذّر الرفع");
      setPreview(null);
    } finally {
      setBusy(false);
      URL.revokeObjectURL(local);
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const r = await removeProductImageAction(productId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setPreview(null);
    router.refresh();
  }

  return (
    <div className="mt-2">
      <div className="flex items-start gap-3">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-line bg-sand">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shown} alt="" className="h-full w-full object-cover" />
          ) : (
            <DrinkArt
              name={productName}
              kind={artKind(category, kind)}
              className="h-full w-full"
            />
          )}
          {busy && (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/40 text-xs text-cream">
              …
            </span>
          )}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={disabled || busy}
              className="tap rounded-xl border border-line bg-cream px-3 py-2 text-xs font-semibold text-ink disabled:opacity-40"
            >
              {shown ? "استبدل الصورة" : "أضف صورة"}
            </button>
            {imageUrl && (
              <button
                type="button"
                onClick={remove}
                disabled={disabled || busy}
                className="tap rounded-xl px-3 py-2 text-xs text-muted disabled:opacity-40"
              >
                إزالة
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[0.7rem] leading-relaxed text-muted">
            من الكاميرا أو الاستوديو. تُصغَّر في هاتفك قبل الرفع.
          </p>
          {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
        </div>
      </div>

      {/*
        بلا `capture`: وضعُها يفتح الكاميرا فوراً على أندرويد ويمنع
        الاختيار من الاستوديو — والمالك قد يكون صوّر مشروباته أمس.
        والمتصفّح يعرض الخيارين بنفسه.
      */}
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={pick}
        className="hidden"
      />
    </div>
  );
}
