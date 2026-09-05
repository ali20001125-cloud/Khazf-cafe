import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCatalog } from "@/lib/catalog";
import { getSettings, strSetting, numSetting } from "@/lib/settings";
import { getActiveBranch } from "@/lib/branch";
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

  const [catalog, settings, branch] = await Promise.all([
    getCatalog(user.bid),
    getSettings(),
    getActiveBranch(user.bid),
  ]);
  const currency = strSetting(settings, "currency", "د.ع");
  const standardFloat = numSetting(settings, "standard_float", 50000);

  if (branch?.pos_locked) {
    return (
      <main className="mx-auto max-w-md px-5 py-20 text-center" dir="rtl">
        <p className="text-2xl font-bold text-red-600">الكاشير مقفل</p>
        <p className="mt-2 text-sm text-neutral-500">أوقفه المالك مؤقتاً. راجع المالك للمتابعة.</p>
      </main>
    );
  }

  const shift = branch ? await getOpenShift(branch.id) : null;

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
