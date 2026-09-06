import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { listMaterials, listPurchases, listWasteLog, listCounts } from "@/lib/inventory";
import { getSettings, strSetting } from "@/lib/settings";
import InventoryManager from "@/components/InventoryManager";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");

  const branch = await getActiveBranch(user.bid);
  if (!branch) return <p className="text-red-600">لا يوجد فرع فعّال.</p>;

  const [materials, settings, purchases, waste, counts] = await Promise.all([
    listMaterials(user.bid),
    getSettings(),
    listPurchases(user.bid),
    listWasteLog(user.bid),
    listCounts(branch.id),
  ]);
  const currency = strSetting(settings, "currency", "د.ع");

  return (
    <InventoryManager
      materials={materials.map((m) => ({
        id: m.id, name: m.name, base_unit: m.base_unit, cached_stock: m.cached_stock,
        low_threshold: m.low_threshold, current_cost: m.current_cost,
      }))}
      purchases={purchases}
      waste={waste}
      counts={counts}
      currency={currency}
    />
  );
}
