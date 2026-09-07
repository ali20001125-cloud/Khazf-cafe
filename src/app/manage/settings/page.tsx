import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings, strSetting, numSetting } from "@/lib/settings";
import { getActiveBranch } from "@/lib/branch";
import SettingsEditor from "@/components/SettingsEditor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "settings.manage"))) redirect("/");

  const [s, branch] = await Promise.all([getSettings(), getActiveBranch(user.bid)]);
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  return (
    <SettingsEditor
      currency={strSetting(s, "currency", "د.ع")}
      shop={{
        shop_name: strSetting(s, "shop_name", "مقهى خزف"),
        shop_phone: strSetting(s, "shop_phone", ""),
        staff_drink_limit: numSetting(s, "staff_drink_limit", 1),
        session_timeout_minutes: numSetting(s, "session_timeout_minutes", 10),
      }}
      branch={{
        standard_float: branch.standard_float,
        day_start_hour: branch.day_start_hour,
        variance_threshold_pct: branch.variance_threshold_pct,
      }}
    />
  );
}
