import "server-only";
import { db } from "./db";
import { getActiveBranchId } from "./branch";

/**
 * ساعات الدوام.
 *
 * الوقت الإضافي **لا يُدفع لأن الموظف بقي**، بل لأن عملاً جرى. والدليل
 * الوحيد الذي لا يُزوَّر بسهولة هو الفاتورة: مالٌ دخل الدرج في تلك الدقيقة.
 * فما بعد الدوام يُعرض كاملاً، ويُقسَم قسمين: ما أثبتته الفواتير وما لم
 * تُثبته. والقرار في الأخير للمالك لا للنظام — النظام لا يتّهم.
 */

export type StaffHoursRow = {
  employee_id: string;
  employee_name: string;
  shifts: number;
  regular_minutes: number;
  overtime_minutes: number;
  paid_overtime_minutes: number;
  unpaid_overtime_minutes: number;
  early_minutes: number;
  overtime_orders: number;
};

export type ShiftHoursRow = {
  shift_id: string;
  employee_name: string;
  business_day: string;
  opened_at: string;
  closed_at: string | null;
  regular_minutes: number;
  overtime_minutes: number;
  early_minutes: number;
  overtime_orders: number;
};

export async function staffHours(
  businessId: string,
  from: string,
  to: string
): Promise<StaffHoursRow[]> {
  return (await db()`
    select employee_id, employee_name, shifts,
           regular_minutes, overtime_minutes,
           paid_overtime_minutes, unpaid_overtime_minutes,
           early_minutes, overtime_orders
    from staff_hours(${businessId}, ${from}::date, ${to}::date)
  `) as StaffHoursRow[];
}

/** ورديات المدّة مفصّلةً — لأن الرقم المجمَّع لا يُراجَع، والصفّ يُراجَع. */
export async function shiftHours(
  businessId: string,
  from: string,
  to: string
): Promise<ShiftHoursRow[]> {
  return (await db()`
    select shift_id, employee_name, business_day::text as business_day,
           opened_at, closed_at,
           regular_minutes, overtime_minutes, early_minutes, overtime_orders
    from v_shift_hours
    where business_id = ${businessId}
      and business_day between ${from}::date and ${to}::date
      and status <> 'OPEN'
    order by business_day desc, opened_at desc
  `) as ShiftHoursRow[];
}

export type OfflineStatus = {
  days: number;
  orders_total: number;
  orders_offline: number;
  last_sync_at: string | null;
  longest_delay_minutes: number | null;
  today_offline: number;
};

/** حالة البيع بلا إنترنت كما يراها الخادم — لا كما يراها متصفّح الباريستا. */
export async function offlineStatus(
  businessId: string,
  days = 7
): Promise<OfflineStatus | null> {
  const branchId = await getActiveBranchId(businessId);
  if (!branchId) return null;
  const rows = (await db()`
    select offline_status(${branchId}, ${days}) as s
  `) as { s: OfflineStatus }[];
  return rows[0]?.s ?? null;
}
