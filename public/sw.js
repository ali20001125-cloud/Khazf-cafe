/*
 * عامل الخدمة — خزف كافيه.
 *
 * غايته واحدة: أن تفتح شاشة الكاشير حين تغيب الشبكة. الملفّات الساكنة
 * (JS/CSS/الخطوط) تُخدَم من الذاكرة أولاً، وصفحة `/pos` تُجرَّب من الشبكة
 * ثم يُرجَع إلى آخر نسخة محفوظة إن تعذّر.
 *
 * ما لا يفعله عمداً: لا يخزّن طلبات POST ولا استجاباتها. البيع لا يمرّ من
 * هنا — يمرّ من طابور localStorage الذي يعرف المفتاح الفريد ووقت البيع،
 * وهما ما يجعل الرفع لاحقاً صحيحاً. وعاملُ خدمةٍ «يُعيد إرسال» طلباً لا
 * يعرف محتواه يُنتج فواتير مكرّرة.
 */
const CACHE = "khazaf-v1";
const SHELL = "/pos";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return; // البيع يمرّ من الطابور لا من هنا
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isStatic = url.pathname.startsWith("/_next/static") || url.pathname.startsWith("/icons");
  const isShell = req.mode === "navigate" && url.pathname.startsWith(SHELL);

  if (isStatic) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone()));
            return res;
          })
      )
    );
    return;
  }

  if (isShell) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(SHELL, res.clone()));
          return res;
        })
        .catch(() =>
          caches.match(SHELL).then(
            (hit) =>
              hit ||
              new Response(
                '<!doctype html><meta charset=utf-8><body dir=rtl style="font-family:system-ui;padding:2rem;text-align:center">' +
                  "<h1>بلا إنترنت</h1><p>افتح شاشة الكاشير مرّة واحدة والشبكة موجودة، فتُحفظ للمرّات القادمة.</p>",
                { headers: { "content-type": "text/html; charset=utf-8" } }
              )
          )
        )
    );
  }
});
