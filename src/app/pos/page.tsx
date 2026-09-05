import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getCatalog } from "@/lib/catalog";
import { getSettings, strSetting } from "@/lib/settings";
import PosScreen from "@/components/PosScreen";

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

  const [catalog, settings] = await Promise.all([getCatalog(user.bid), getSettings()]);
  const currency = strSetting(settings, "currency", "د.ع");

  return <PosScreen catalog={catalog} currency={currency} userName={user.name} />;
}
