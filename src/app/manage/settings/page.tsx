import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings, strSetting, numSetting, boolSetting } from "@/lib/settings";
import SettingsEditor from "@/components/SettingsEditor";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "change_settings"))) redirect("/");

  const s = await getSettings();
  const vt = (s.variance_thresholds as { green?: number; amber?: number }) ?? {};

  return (
    <SettingsEditor
      initial={{
        shop_name: strSetting(s, "shop_name", "مقهى خزف"),
        shop_phone: strSetting(s, "shop_phone", ""),
        standard_float: numSetting(s, "standard_float", 50000),
        staff_drink_limit: numSetting(s, "staff_drink_limit", 1),
        extra_shot_price: numSetting(s, "extra_shot_price", 500),
        shot_grams: numSetting(s, "shot_grams", 9),
        session_timeout_minutes: numSetting(s, "session_timeout_minutes", 10),
        variance_green: typeof vt.green === "number" ? vt.green : 3,
        variance_amber: typeof vt.amber === "number" ? vt.amber : 5,
        low_stock_alert: boolSetting(s, "low_stock_alert", true),
      }}
    />
  );
}
