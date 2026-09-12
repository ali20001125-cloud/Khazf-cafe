import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCatalog } from "@/lib/catalog";
import { getSettings, strSetting } from "@/lib/settings";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import PosScreen from "@/components/PosScreen";
import OpenShiftPanel from "@/components/OpenShiftPanel";
import { myPinIsDefault } from "@/lib/users";
import { pendingHandoverForMe } from "@/app/pos/shift-actions";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const user = currentUser();
  if (!user) redirect("/login");

  if (!(await can(user, "orders.create"))) {
    return (
      <main className="mx-auto max-w-md px-5 py-16 text-center" dir="rtl">
        <p className="text-lg font-semibold text-red-600">لا تملك صلاحية البيع.</p>
        <Link href="/" className="btn-ghost mt-6 inline-block px-8 py-3">→ الرئيسية</Link>
      </main>
    );
  }

  const [catalog, settings, branch] = await Promise.all([
    getCatalog(user.bid),
    getSettings(),
    getActiveBranch(user.bid),
  ]);
  const currency = strSetting(settings, "currency", "د.ع");

  if (branch?.pos_locked) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center" dir="rtl">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-3xl">🔒</div>
        <p className="mt-5 font-display text-2xl font-bold text-ink">الكاشير مقفل</p>
        <p className="mt-2 text-sm text-muted">أوقفه المالك مؤقتاً. راجع المالك للمتابعة.</p>
        <Link href="/" className="btn-ghost mt-6 px-8 py-3">→ الرئيسية</Link>
      </main>
    );
  }

  const shift = branch ? await getOpenShift(branch.id) : null;

  if (!shift) {
    // المالك وحده يعدّل الفكّة عند الفتح؛ الباريستا يؤكّدها كما هي.
    const canEditFloat = await can(user, "settings.manage");
    return (
      <OpenShiftPanel
        standardFloat={branch?.standard_float ?? 0}
        currency={currency}
        userName={user.name}
        canEditFloat={canEditFloat}
      />
    );
  }

  // الصلاحيات تُقرَّر في الخادم؛ الواجهة تُخفي فقط، والفعل يُفحص ثانيةً (§66).
  const [canNoSale, canHandover, pendingHandover, pinIsDefault] = await Promise.all([
    can(user, "cash.no_sale_open"),
    can(user, "cash.handover"),
    pendingHandoverForMe(),
    myPinIsDefault(user.uid),
  ]);

  return (
    <PosScreen
      catalog={catalog}
      currency={currency}
      userName={user.name}
      pinIsDefault={pinIsDefault}
      shift={{ id: shift.id, opening_float: shift.opening_float }}
      canNoSale={canNoSale}
      canHandover={canHandover}
      pendingHandover={pendingHandover}
    />
  );
}
