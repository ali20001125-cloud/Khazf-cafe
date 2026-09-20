"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { lockScreenAction } from "@/app/pos/lock-actions";
import LockScreen from "./LockScreen";

/**
 * قفل الشاشة بعد خمول.
 *
 * كان «قفل الشاشة بعد خمول (دقائق)» إعداداً في اللوحة يُحفظ في القاعدة
 * **ولا يقرأه سطرٌ واحد**. فالمالك يكتب ١٠ ويظنّ الكاشير يُقفل، وهو لا
 * يُقفل أبداً. وإعدادٌ يكذب أسوأ من إعدادٍ ناقص: الأوّل يُطمئن زوراً،
 * والثاني يُرى فيُعالَج.
 *
 * والقفل **يُوسم في الكوكي الموقّع**، لا يُرسم في المتصفّح وحده:
 *   • `requirePermission` ترفض كل فعلٍ خادميّ ما دام الوسم قائماً.
 *   • والتحديث يُعيد شاشة القفل من الخادم بلا محتوى تحتها.
 *   • والسلّة تبقى هنا في الذاكرة، فمن عاد برمزه أكمل من حيث وقف.
 *
 * صفرٌ = لا قفل. والمالك هو من يقرّر في الإعدادات.
 */
export default function IdleLock({ minutes, userName }: { minutes: number; userName: string }) {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(async () => {
    setLocked(true);
    try {
      await lockScreenAction();
    } catch {
      /* لو تعذّر الاتصال تبقى الستارة — والخادم يرفض بلا كوكي صالح */
    }
  }, []);

  useEffect(() => {
    if (locked || !(minutes > 0)) return;

    const reset = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(lock, minutes * 60_000);
    };
    reset();

    // `passive` كي لا يُبطئ التمرير على جهازٍ ضعيف وسط الخدمة
    const evs = ["pointerdown", "keydown", "wheel", "touchstart", "scroll"] as const;
    for (const e of evs) window.addEventListener(e, reset, { passive: true });

    // العودة من شاشةٍ أخرى لا تُعتبر نشاطاً: الجهاز قد يكون بيد غير صاحبه
    const onVisible = () => {
      if (document.visibilityState === "visible") reset();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer.current) clearTimeout(timer.current);
      for (const e of evs) window.removeEventListener(e, reset);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [locked, minutes, lock]);

  // الزرّ اليدويّ: «خلصت الطلب، اقفل» — بلا انتظار المهلة
  useEffect(() => {
    const onAsk = () => void lock();
    window.addEventListener("khazf:lock", onAsk);
    return () => window.removeEventListener("khazf:lock", onAsk);
  }, [lock]);

  if (!locked) return null;
  return <LockScreen userName={userName} onUnlocked={() => { setLocked(false); router.refresh(); }} />;
}

