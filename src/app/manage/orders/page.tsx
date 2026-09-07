import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getSettings, strSetting } from "@/lib/settings";
import { ordersForDay } from "@/lib/orders-admin";
import { money } from "@/lib/format";
import OrdersTable from "@/components/OrdersTable";

/** طلبات اليوم مع الإلغاء والإرجاع (§49 · §50) — للمالك فقط. */
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: { day?: string };
}) {
  const user = currentUser()!;
  if (!(await can(user, "orders.view_all"))) {
    return <p className="card p-8 text-center text-red-600">لا تملك صلاحية عرض الطلبات.</p>;
  }

  const [branch, settings] = await Promise.all([getActiveBranch(user.bid), getSettings()]);
  const currency = strSetting(settings, "currency", "د.ع");
  if (!branch) return <p className="card p-8 text-center">لا يوجد فرع فعّال.</p>;

  const day = searchParams.day;
  const orders = await ordersForDay(branch.id, day);

  // إجماليات اليوم: الملغى لا يُحتسب بيعاً (§49)
  const live = orders.filter((o) => !["VOIDED", "CANCELLED"].includes(o.status));
  const sales = live.filter((o) => o.order_type === "SALE");
  const revenue = sales.reduce((s, o) => s + o.total - o.refunded, 0);
  const rewards = live.filter((o) => o.order_type === "LOYALTY_REWARD").length;
  const staff = live.filter((o) => o.order_type === "STAFF_DRINK").length;
  const voided = orders.filter((o) => o.status === "VOIDED").length;

  return (
    <div className="mx-auto max-w-4xl">
      <header className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">الطلبات</h1>
          <p className="mt-1 text-sm text-muted">
            {day ? `يوم ${day}` : "اليوم"} · بتوقيت الفرع
          </p>
        </div>
        <Link href="/manage/exceptions" className="btn-ghost px-4 py-2 text-sm">
          الشاذّ ←
        </Link>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="فواتير البيع" value={String(sales.length)} />
        <Stat label="صافي المبيعات" value={money(revenue, currency)} />
        <Stat label="مكافآت ولاء" value={String(rewards)} />
        <Stat label="ملغاة" value={String(voided)} tone={voided > 0 ? "amber" : undefined} />
      </div>

      {staff > 0 && (
        <p className="mb-4 text-xs text-muted">
          و<span className="nums">{staff}</span> مشروب موظف (بلا إيراد).
        </p>
      )}

      <div className="card p-2">
        <OrdersTable orders={orders} currency={currency} />
      </div>

      <p className="mt-4 text-xs text-muted">
        لا يوجد حذف: الإلغاء والإرجاع وثيقتان تُضافان فوق الطلب، والأصل يبقى.
      </p>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "amber" }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`nums mt-1 font-display text-xl font-bold ${
          tone === "amber" ? "text-amber-700" : "text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
