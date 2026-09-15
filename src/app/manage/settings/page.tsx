import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSettings, strSetting, numSetting } from "@/lib/settings";
import { getActiveBranch } from "@/lib/branch";
import SettingsEditor from "@/components/SettingsEditor";
import BackupPanel from "@/components/BackupPanel";
import ResetPanel from "@/components/ResetPanel";
import { db } from "@/lib/db";
import { backupSize, lastBackupAt } from "@/lib/backup";
import { timeAr } from "@/lib/format";

export const dynamic = "force-dynamic";

/** ما سيُحذف لو صُفِّرت البيانات — يُعرض قبل السؤال لا بعده. */
async function liveCounts() {
  const rows = (await db()`
    select (select count(*) from orders)::int as orders,
           (select count(*) from payments)::int as payments,
           (select coalesce(sum(amount), 0) from payments)::int as revenue
  `) as { orders: number; payments: number; revenue: number }[];
  return rows[0] ?? { orders: 0, payments: 0, revenue: 0 };
}

export default async function SettingsPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "settings.manage"))) redirect("/");

  const [s, branch, size, lastBackup, counts] = await Promise.all([
    getSettings(),
    getActiveBranch(user.bid),
    backupSize(),
    lastBackupAt(user.bid),
    liveCounts(),
  ]);
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  return (
    <div className="space-y-6">
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
        drawer_count_by: branch.drawer_count_by,
        shift_start_hour: branch.shift_start_hour,
        shift_end_hour: branch.shift_end_hour,
        overtime_min_orders: branch.overtime_min_orders,
      }}
    />

    <BackupPanel
      tables={size.tables}
      rows={size.rows}
      lastBackupAt={lastBackup ? timeAr(lastBackup) : null}
    />

    <ResetPanel
      orders={counts.orders}
      payments={counts.payments}
      revenue={counts.revenue}
      currency={strSetting(s, "currency", "د.ع")}
    />
    </div>
  );
}
