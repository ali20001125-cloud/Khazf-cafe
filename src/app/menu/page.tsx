import type { Viewport } from "next";
import MenuView from "./MenuView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "منيو خزف",
  description: "قائمة مشروبات مقهى خزف",
};

/**
 * التخطيط العام يمنع التكبير — صوابٌ في كاشير يُلمس بالإبهام وسط
 * الخدمة، وخطأٌ في منيو يقرأه زبونٌ قد يكون ضعيف البصر. فهذه الصفحة
 * تستعيده لنفسها وحدها.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
  themeColor: "#1C1A18",
};

export default function MenuPage() {
  return <MenuView lang="ar" />;
}
