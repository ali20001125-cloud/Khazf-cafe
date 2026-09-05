import "server-only";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { setSession, clearSession, readSession, type SessionData } from "./session";
import type { UserRole } from "./types";

/**
 * الدخول الآمن: PIN مُهشّر (bcrypt) + حدّ محاولات + قفل مؤقّت.
 * كل نجاح/فشل يُسجَّل في audit_log. الفحص كله في الخادم.
 */

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 5;

export type LoginUser = { id: string; name: string; role: UserRole };

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "locked"; minutes: number }
  | { ok: false; reason: "bad_pin"; remaining: number }
  | { ok: false; reason: "not_found" };

/** المستخدمون النشطون لشاشة الدخول (بلا أي سرّ). */
export async function listLoginUsers(): Promise<LoginUser[]> {
  const rows = (await db()`
    select id, name, role
    from users
    where active
    order by case role when 'owner' then 0 else 1 end, name
  `) as LoginUser[];
  return rows;
}

type Row = {
  id: string;
  business_id: string;
  name: string;
  role: UserRole;
  pin_hash: string;
  active: boolean;
  failed_pin_attempts: number;
  locked_until: string | null;
};

export async function login(userId: string, pin: string): Promise<LoginResult> {
  const rows = (await db()`
    select id, business_id, name, role, pin_hash, active, failed_pin_attempts, locked_until
    from users where id = ${userId}
  `) as Row[];
  const u = rows[0];
  if (!u || !u.active) return { ok: false, reason: "not_found" };

  // مقفل؟
  if (u.locked_until && new Date(u.locked_until).getTime() > Date.now()) {
    const minutes = Math.max(1, Math.ceil((new Date(u.locked_until).getTime() - Date.now()) / 60000));
    return { ok: false, reason: "locked", minutes };
  }

  const good = await bcrypt.compare(pin ?? "", u.pin_hash);

  if (!good) {
    const attempts = (u.failed_pin_attempts ?? 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      const until = new Date(Date.now() + LOCK_MINUTES * 60000).toISOString();
      await db()`update users set failed_pin_attempts = 0, locked_until = ${until} where id = ${u.id}`;
      await audit(u.business_id, u.id, "login_locked", "user", u.id, `قفل بعد ${MAX_ATTEMPTS} محاولات`);
      return { ok: false, reason: "locked", minutes: LOCK_MINUTES };
    }
    await db()`update users set failed_pin_attempts = ${attempts} where id = ${u.id}`;
    return { ok: false, reason: "bad_pin", remaining: MAX_ATTEMPTS - attempts };
  }

  // نجاح
  await db()`
    update users
    set failed_pin_attempts = 0, locked_until = null, last_login_at = now()
    where id = ${u.id}
  `;
  await audit(u.business_id, u.id, "login", "user", u.id, null);
  setSession({ uid: u.id, bid: u.business_id, role: u.role, name: u.name });
  return { ok: true };
}

export async function logout(): Promise<void> {
  const s = readSession();
  if (s) await audit(s.bid, s.uid, "logout", "user", s.uid, null);
  clearSession();
}

/** المستخدم الحالي من الجلسة الموقّعة (بلا مسّ القاعدة). */
export function currentUser(): SessionData | null {
  return readSession();
}

async function audit(
  businessId: string,
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  reason: string | null
): Promise<void> {
  try {
    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, entity_id, reason)
      values (${businessId}, ${userId}, ${action}, ${entityType}, ${entityId}, ${reason})
    `;
  } catch {
    // التدقيق لا يُفشل الدخول
  }
}
