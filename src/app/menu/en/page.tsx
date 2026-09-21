import type { Viewport } from "next";
import MenuView from "../MenuView";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Khazaf Menu",
  description: "Specialty coffee at Khazaf café",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  userScalable: true,
  themeColor: "#1C1A18",
};

export default function MenuPageEn() {
  return <MenuView lang="en" />;
}
