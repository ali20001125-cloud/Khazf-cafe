"use client";

import { useEffect } from "react";

/**
 * تسجيل عامل الخدمة — ليُفتح الكاشير بلا شبكة.
 *
 * يُسجَّل في الإنتاج وحده: في التطوير يُخزّن ملفّات قديمة فيُربك التعديل.
 */
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // تعذّر التسجيل (متصفّح قديم أو بلا HTTPS) — الكاشير يعمل أونلاين كما هو
    });
  }, []);
  return null;
}
