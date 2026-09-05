import "server-only";
import { db } from "./db";
import { currentUser } from "./auth";
import type { SessionData } from "./session";

/**
 * فحص الصلاحيات في الخادم لكل عملية (المواصفة §٢: لا يكفي إخفاء الزر).
 * الصلاحيات مخزّنة في role_permissions وتُسند للأدوار — قابلة للتوسّع بلا كود.
 */

export type Permission =
  | "sell" | "open_shift" | "close_shift" | "record_waste" | "staff_drink"
  | "no_sale_open" | "void_draft" | "void_paid" | "refund" | "apply_discount"
  | "adjust_inventory" | "stock_count" | "add_stock" | "purchase"
  | "change_prices" | "manage_products" | "manage_staff" | "change_settings"
  | "view_reports" | "cash_drop" | "cash_removal" | "lock_pos" | "unlock_pos"
  | "day_close" | "reopen_day";

// كاش بسيط بالذاكرة (الصلاحيات نادرة التغيّر). يُفرَّغ عند تعديلها (م٦).
const cache = new Map<string, Set<string>>(); // key: `${businessId}:${role}`

export function clearPermissionCache(): void {
  cache.clear();
}

async function permsFor(businessId: string, roleKey: string): Promise<Set<string>> {
  const key = `${businessId}:${roleKey}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const rows = (await db()`
    select rp.permission
    from role_permissions rp
    join roles r on r.id = rp.role_id
    where r.business_id = ${businessId} and r.key = ${roleKey}
  `) as { permission: string }[];
  const set = new Set(rows.map((r) => r.permission));
  cache.set(key, set);
  return set;
}

export async function can(user: SessionData, perm: Permission): Promise<boolean> {
  const set = await permsFor(user.bid, user.role);
  return set.has(perm);
}

export class AuthError extends Error {
  constructor(public code: "unauthenticated" | "forbidden", message: string) {
    super(message);
    this.name = "AuthError";
  }
}

/** يُرجع المستخدم أو يرمي unauthenticated. */
export function requireUser(): SessionData {
  const u = currentUser();
  if (!u) throw new AuthError("unauthenticated", "الرجاء تسجيل الدخول");
  return u;
}

/** يتحقّق من الصلاحية أو يرمي — يُستدعى في بداية كل عملية حسّاسة. */
export async function requirePermission(perm: Permission): Promise<SessionData> {
  const u = requireUser();
  if (!(await can(u, perm))) {
    throw new AuthError("forbidden", "لا تملك صلاحية هذه العملية");
  }
  return u;
}
