import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { staffHours, shiftHours } from "@/lib/hours";
import HoursView from "@/components/HoursView";

export const dynamic = "force-dynamic";

/** آخر ٣٠ يوماً افتراضاً — المدى يختاره المالك من الشاشة. */
function range(sp: Record<string, string | string[] | undefined>) {
  const today = new Date();
  const to = typeof sp.to === "string" ? sp.to : today.toISOString().slice(0, 10);
  const fromD = new Date(`${to}T00:00:00Z`);
  fromD.setUTCDate(fromD.getUTCDate() - 29);
  const from = typeof sp.from === "string" ? sp.from : fromD.toISOString().slice(0, 10);
  return { from, to };
}

export default async function HoursPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "users.manage"))) redirect("/");

  const sp = await searchParams;
  const { from, to } = range(sp);

  const [branch, staff, shifts] = await Promise.all([
    getActiveBranch(user.bid),
    staffHours(user.bid, from, to),
    shiftHours(user.bid, from, to),
  ]);

  return (
    <HoursView
      from={from}
      to={to}
      staff={staff}
      shifts={shifts}
      startHour={branch?.shift_start_hour ?? 16}
      endHour={branch?.shift_end_hour ?? 24}
      minOrders={branch?.overtime_min_orders ?? 1}
    />
  );
}
