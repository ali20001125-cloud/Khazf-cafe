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
 * **تُضغط في الهاتف قبل أن تُرسل، إلى ٢٠٠ كيلوبايت أو أقلّ.** صورة
 * هاتفٍ حديث ميغابايت إلى أربعة، وهي تُعرض في مربّعٍ عرضه أصابع. رفعها
 * كما هي يُبطئ المالك على شبكته، ثمّ يُبطئ كل زبونٍ يفتح المنيو بعده
 * على شبكته هو.
 *
 * كان التصغير بجودةٍ ثابتة (٠٫٨)، فتخرج الصورة بين ١٥٠ و٤٠٠ كيلو حسب
 * ما فيها — صورةٌ فيها تفاصيل كثيرة تخرج أثقل. والمالك كان يمرّرها
 * على تيليغرام ليصغّرها بيده قبل الرفع. الآن **الحجم هو الهدف لا
 * الجودة**: تنزل الجودة درجةً درجة حتى تدخل تحت السقف، ولا تنزل تحت
 * حدٍّ يُرى فيه التشويش — فإن لم تكفِ صَغُر البُعد.
 *
 * و**WebP** أوّلاً حيث يدعمه المتصفّح (أندرويد وكروم): أصغر من JPEG
 * بالثلث تقريباً بالعين نفسها. وسفاري القديم يُرجع PNG بدلاً منه
 * بصمت، فيُفحص النوع الخارج لا المطلوب، ويُرجع إلى JPEG.
 *
 * ولا يُرفع شيءٌ قبل أن يُرى: المعاينة تظهر فور الاختيار، فمن التقط
 * صورةً مائلة يعرف قبل أن ينتظر الرفع.
 */
const TARGET_BYTES = 200 * 1024;
const EDGES = [1200, 1000, 800];
const QUALITIES = [0.82, 0.74, 0.66, 0.58];

function encode(canvas: HTMLCanvasElement, type: string, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, type, q));
}

/** يفتح الصورة — وإن فشل `createImageBitmap` (متصفّحٌ قديم) فبعنصر صورة. */
async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number; done: () => void } | null> {
  const bmp = await createImageBitmap(file).catch(() => null);
  if (bmp) return { img: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };

  const url = URL.createObjectURL(file);
  const el = new Image();
  const ok = await new Promise<boolean>((res) => {
    el.onload = () => res(true);
    el.onerror = () => res(false);
    el.src = url;
  });
  if (!ok) {
    URL.revokeObjectURL(url);
    return null;
  }
  return { img: el, w: el.naturalWidth, h: el.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

async function shrink(file: File): Promise<Blob> {
  // PNG قد يكون شفّافاً، وتحويله يملأ الشفافية بلون. فالشفّاف الصغير
  // يُترك كما هو.
  if (file.type === "image/png" && file.size <= TARGET_BYTES) return file;

  const src = await decode(file);
  if (!src) return file;

  let best: Blob | null = null;
  try {
    for (const edge of EDGES) {
      const scale = Math.min(1, edge / Math.max(src.w, src.h));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(src.w * scale));
      canvas.height = Math.max(1, Math.round(src.h * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) return file;
      // خلفيةٌ كريمية لا سوداء لما كان شفّافاً
      ctx.fillStyle = "#f5efe6";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src.img, 0, 0, canvas.width, canvas.height);

      for (const q of QUALITIES) {
        let blob = await encode(canvas, "image/webp", q);
        if (!blob || blob.type !== "image/webp") blob = await encode(canvas, "image/jpeg", q);
        if (!blob) continue;
        if (!best || blob.size < best.size) best = blob;
        if (blob.size <= TARGET_BYTES) return blob;
      }
    }
  } finally {
    src.done();
  }
  // لم تدخل تحت السقف حتى بأصغر بُعدٍ وجودة — فأصغر ما خرج، لا الأصل
  return best && best.size < file.size ? best : file;
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
      fd.append("file", small, small.type === "image/webp" ? "photo.webp" : "photo.jpg");
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
            من الكاميرا أو الاستوديو. تُضغط تلقائياً إلى ٢٠٠ كيلو أو أقلّ —
            ارفعها كما هي. والمشروب في الوسط: تُقصّ مربّعاً في المنيو.
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
