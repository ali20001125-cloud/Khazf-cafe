import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import QRCode from "qrcode";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { menuAdmin } from "@/lib/menu";
import { getSettings, strSetting } from "@/lib/settings";
import MenuEditor from "@/components/MenuEditor";

export const dynamic = "force-dynamic";

export default async function ManageMenuPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "products.manage"))) redirect("/");

  const [rows, settings] = await Promise.all([menuAdmin(user.bid), getSettings()]);

  // الرابط من المضيف الذي يزوره المالك الآن — لا ثابتاً في الكود، فينكسر
  // بأوّل تغيير نطاق
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const menuUrl = host ? `${proto}://${host}/menu` : "/menu";

  const qr = host
    ? await QRCode.toString(menuUrl, {
        type: "svg",
        margin: 1,
        width: 220,
        color: { dark: "#1C1A18", light: "#FBF7F0" },
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/manage" className="navlink text-sm text-muted hover:text-ink">
          ← لوحة الإدارة
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">المنيو</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          منيو إلكتروني يفتحه الزبون برمزٍ على الطاولة. لا طباعة ولا حدّ أدنى
          ولا تصميم — وحين يتغيّر سعرٌ عندك يتغيّر عنده في اللحظة نفسها.
        </p>
      </div>

      <MenuEditor
        rows={rows}
        currency={strSetting(settings, "currency", "د.ع")}
        menuUrl={menuUrl}
        qrSvg={qr}
      />
    </div>
  );
}
