import "server-only";
import { db } from "./db";

/**
 * قراءة المستخدمين لشاشة المالك. **لا يخرج من هنا تهشير ولا رمز** — ولا حتى
 * للمالك: الرمز طريق واحد، والمالك يعيّن رمزاً جديداً ولا يقرأ القديم.
 */

export type StaffRow = {
  id: string;
  name: string;
  role: "owner" | "barista";
  active: boolean;
  /** فارغ = ما زال الرمز الافتراضي من التنصيب */
  pin_changed_at: string | null;
  locked_until: string | null;
  failed_pin_attempts: number;
  last_login_at: string | null;
  /** أرقام تُظهر أثره في المقهى — لتفسير «لماذا لا يُحذف» */
  shifts_count: number;
  orders_count: number;
  has_open_shift: boolean;
};

export async function listStaff(businessId: string): Promise<StaffRow[]> {
  return (await db()`
    select u.id, u.name, u.role::text as role, u.active,
           u.pin_changed_at, u.locked_until,
           coalesce(u.failed_pin_attempts, 0) as failed_pin_attempts,
           u.last_login_at,
           (select count(*)::int from shifts s where s.employee_id = u.id) as shifts_count,
           (select count(*)::int from orders o where o.employee_id = u.id) as orders_count,
           exists (select 1 from shifts s
                    where s.status = 'OPEN'
                      and (s.employee_id = u.id or s.drawer_owner_id = u.id)) as has_open_shift
    from users u
    where u.business_id = ${businessId}
    order by u.active desc,
             case u.role when 'owner' then 0 else 1 end,
             u.name
  `) as StaffRow[];
}

/** هل أحدٌ ما زال على الرمز الافتراضي؟ يُستخدم للتحذير في لوحة الإدارة. */
export async function defaultPinCount(businessId: string): Promise<number> {
  const rows = (await db()`
    select count(*)::int as n from users
    where business_id = ${businessId} and active and pin_changed_at is null
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}

/** هل رمز هذا المستخدم ما زال الافتراضي؟ يُستخدم لتحذيره في شاشته. */
export async function myPinIsDefault(userId: string): Promise<boolean> {
  const rows = (await db()`
    select pin_changed_at from users where id = ${userId}
  `) as { pin_changed_at: string | null }[];
  return rows[0] ? rows[0].pin_changed_at === null : false;
}
