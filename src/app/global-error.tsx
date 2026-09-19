"use client";

/**
 * آخر شبكة أمان.
 *
 * `error.tsx` يلتقط أعطال الصفحات، لكنه يعيش **داخل** التخطيط الجذر —
 * فلو انكسر التخطيط نفسه لم يلتقطه شيء، ورأى الباريستا شاشةً بيضاء
 * وسط الخدمة. وهذا الملفّ يستبدل الوثيقة كلّها، فلا يعتمد على شيءٍ
 * قد يكون هو المكسور — ولذلك يحمل `<html>` و`<body>` بنفسه.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, background: "#F4F1EA", color: "#1A1A1A", fontFamily: "system-ui, sans-serif" }}>
        <main
          style={{
            minHeight: "100vh", display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ margin: "12px 0 0", fontSize: 20 }}>تعطّل النظام مؤقّتاً</h1>
          <p style={{ margin: "8px 0 0", maxWidth: 320, fontSize: 14, lineHeight: 1.8, color: "#6B6B6B" }}>
            لم يضِع شيء من بياناتك — الطلبات والمخزون محفوظة في قاعدة
            البيانات. أعد المحاولة، وإن تكرّر أعد تحميل الصفحة.
          </p>
          <button
            onClick={() => reset()}
            style={{
              marginTop: 24, padding: "14px 28px", border: 0, borderRadius: 16,
              background: "#A66A4C", color: "#FAF7F0", fontSize: 16, fontWeight: 700,
            }}
          >
            أعد المحاولة
          </button>
        </main>
      </body>
    </html>
  );
}
