import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "خزف كافيه",
  description: "نظام كاشير مقهى خزف",
  robots: { index: false, follow: false },
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // على iOS: يُفتح ملء الشاشة بلا شريط عنوان ولا زرّ رجوع. زرّ رجوعٍ
  // بالغلط وسط بيعة يُفقد السلّة، والباريستا لا يعرف أين ذهبت.
  appleWebApp: { capable: true, title: "خزف", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  // التكبير بإصبعين يزيح الشبكة وسط الخدمة، ولا فائدة منه في كاشير
  userScalable: false,
  // `cover` يجعل الصفحة تمتدّ تحت شريط الحالة، وحشوات الأمان تُبعد
  // المحتوى عنه — فلا يختفي زرٌّ خلف النوتش.
  viewportFit: "cover",
  themeColor: "#1C1A18",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="min-h-full antialiased">
        <ServiceWorker />
        {children}
      </body>
    </html>
  );
}
