import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProductsAdmin } from "@/lib/products-admin";
import { getSettings, strSetting } from "@/lib/settings";
import { materialOverview } from "@/lib/inventory-overview";
import ProductsEditor from "@/components/ProductsEditor";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "products.manage"))) redirect("/");

  const [products, settings, materials] = await Promise.all([
    getProductsAdmin(user.bid),
    getSettings(),
    materialOverview(user.bid, 30),
  ]);

  // المحاصيل = المواد المقاسة بالغرام (حبوب القهوة)، سواء رُبطت بمشروب أم لا،
  // حتى يظهر المحصول الجديد فور إنشائه قبل ربطه بأي مشروب.
  const crops = materials
    .filter((m) => m.base_unit === "g")
    .map((m) => ({ id: m.id, name: m.name, stock: m.stock }));

  return (
    <ProductsEditor
      products={products}
      crops={crops}
      currency={strSetting(settings, "currency", "د.ع")}
    />
  );
}
