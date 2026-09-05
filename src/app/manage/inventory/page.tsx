import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { listMaterials } from "@/lib/inventory";
import { getSettings, strSetting } from "@/lib/settings";
import InventoryManager from "@/components/InventoryManager";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");

  const [materials, settings] = await Promise.all([listMaterials(user.bid), getSettings()]);
  const currency = strSetting(settings, "currency", "د.ع");

  return (
    <InventoryManager
      materials={materials.map((m) => ({
        id: m.id,
        name: m.name,
        base_unit: m.base_unit,
        cached_stock: m.cached_stock,
        low_threshold: m.low_threshold,
        current_cost: m.current_cost,
      }))}
      currency={currency}
    />
  );
}
