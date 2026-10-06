import "server-only";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { getSettings, strSetting } from "./settings";
import { customerOrigin } from "./public-url";
import { printAddons, printMenu, stampsPerReward } from "./print-menu";

/**
 * كل ما تحتاجه ورقة منيو مطبوعة، مرّةً واحدة: الأصناف والإضافات ورمزا
 * QR وبيانات التواصل. التصاميم تختلف، والبيانات واحدة.
 */
export async function loadPrintData(businessId: string, qrDark = "#1C1A18", qrLight = "#FAF7F0") {
  const settings = await getSettings();
  const h = headers();
  const site = customerOrigin(
    settings.public_url,
    h.get("x-forwarded-host") ?? h.get("host") ?? "",
    h.get("x-forwarded-proto") ?? "https"
  );

  const qr = (path: string) =>
    site.origin
      ? QRCode.toString(`${site.origin}${path}`, {
          type: "svg",
          margin: 0,
          errorCorrectionLevel: "M",
          color: { dark: qrDark, light: qrLight },
        })
      : Promise.resolve(null);

  const [items, addons, per, menuQr, loyaltyQr] = await Promise.all([
    printMenu(businessId),
    printAddons(businessId),
    stampsPerReward(),
    qr("/menu"),
    qr("/loyalty"),
  ]);

  return {
    items,
    addons,
    per,
    menuQr,
    loyaltyQr,
    siteConfigured: site.configured,
    story: strSetting(settings, "shop_story", "قهوة مختصّة، تُحضَّر على مهل"),
    address: strSetting(settings, "shop_address", ""),
    phone: strSetting(settings, "shop_phone", ""),
    instagram: strSetting(settings, "shop_instagram", "").replace(/^@+/, ""),
  };
}
