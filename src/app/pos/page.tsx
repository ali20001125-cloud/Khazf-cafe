import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCatalog } from "@/lib/catalog";
import { getSettings, strSetting, numSetting } from "@/lib/settings";
import { getActiveBranchId } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import PosScreen from "@/components/PosScreen";
import OpenShiftPanel from "@/components/OpenShiftPanel";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const user = currentUser();
  if (!user) redirect("/login");

  if (!(await can(user, "sell"))) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center">
        <p className="text-lg font-semibold text-red-600">لا تملك صلاحية البيع.</p>
      </main>
    );
  }

  const [catalog, settings, branchId] = await Promise.all([
    getCatalog(user.bid),
    getSettings(),
    getActiveBranchId(user.bid),
  ]);
  const currency = strSetting(settings, "currency", "د.ع");
  const standardFloat = numSetting(settings, "standard_float", 50000);
  const shift = branchId ? await getOpenShift(branchId) : null;

  if (!shift) {
    return (
      <OpenShiftPanel standardFloat={standardFloat} currency={currency} userName={user.name} />
    );
  }

  return (
    <PosScreen
      catalog={catalog}
      currency={currency}
      userName={user.name}
      shift={{ id: shift.id, opening_float: shift.opening_float }}
    />
  );
}
