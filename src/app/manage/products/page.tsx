import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getProductsAdmin } from "@/lib/products-admin";
import { getSettings, strSetting } from "@/lib/settings";
import ProductsEditor from "@/components/ProductsEditor";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "products.manage"))) redirect("/");

  const [products, settings] = await Promise.all([getProductsAdmin(user.bid), getSettings()]);
  const currency = strSetting(settings, "currency", "د.ع");

  return <ProductsEditor products={products} currency={currency} />;
}
