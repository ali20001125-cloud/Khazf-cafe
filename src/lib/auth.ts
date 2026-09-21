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

export type LoginResult =
  | { ok: true }
  | { ok: false; reason: "locked"; minutes: number }
  | { ok: false; reason: "bad_pin"; remaining: number }
  | { ok: false; reason: "not_found" };

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

/**
 * الدخول بالاسم ثمّ الرمز.
 *
 * كان بالرمز وحده، والنظام يُجرّبه على كل الحسابات حتى يجد صاحبه. طلب
 * المالك الاسم معه، وفيه مكسبان تقنيّان لا مجرّد شكل:
 *
 *   ١. **قفل الحساب يعمل أخيراً.** بلا اسمٍ لا يُعرف على مَن يُحسب
 *      الفشل — رمزٌ خاطئ لا يخصّ أحداً — فكان `failed_pin_attempts`
 *      في الجدول بلا قارئ. والآن يُعرف الحساب فيُقفل هو.
 *   ٢. **مقارنة واحدة لا عشر.** `bcrypt` بطيءٌ عمداً، وتجريبه على كل
 *      المستخدمين يتضاعف مع كل موظّف يُضاف.
 *
 * ولا يُفشى أيّ اسمٍ موجود: الخطأ واحدٌ للاسم المجهول وللرمز الخاطئ
 * («الاسم أو الرمز غير صحيح»)، وإلّا صارت الشاشة أداةً تُعرف بها
 * أسماء الموظّفين بالتجريب.
 *
 * والرمز يقبل الحروف: رمز المالك عنده `alikhazf20001125`. و`bcrypt`
 * لا يبالي — نصٌّ كأيّ نصّ.
 */
const deviceFails = new Map<string, { n: number; until: number }>();

/** يُطابَق الاسم بلا حساسيةٍ لحالة الأحرف ولا لفراغات الأطراف. */
function sameName(a: string, b: string): boolean {
  return a.trim().toLocaleLowerCase("ar") === b.trim().toLocaleLowerCase("ar");
}

export async function loginByName(
  name: string,
  code: string,
  deviceKey: string
): Promise<LoginResult> {
  const now = Date.now();
  const gate = deviceFails.get(deviceKey);
  if (gate && gate.until > now) {
    return { ok: false, reason: "locked", minutes: Math.max(1, Math.ceil((gate.until - now) / 60000)) };
  }

  const who = (name ?? "").trim();
  const clean = (code ?? "").trim();
  if (who.length === 0 || clean.length < 4) return { ok: false, reason: "not_found" };

  const rows = (await db()`
    select id, business_id, name, role, pin_hash, active, failed_pin_attempts, locked_until
    from users where active
  `) as Row[];

  const u = rows.find((r) => sameName(r.name, who));

  // الاسم المجهول يُعامَل معاملة الرمز الخاطئ: لا تُفشى الأسماء
  if (!u) return bumpDevice(deviceKey, gate);

  if (u.locked_until && new Date(u.locked_until).getTime() > now) {
    const minutes = Math.max(1, Math.ceil((new Date(u.locked_until).getTime() - now) / 60000));
    return { ok: false, reason: "locked", minutes };
  }

  if (!(await bcrypt.compare(clean, u.pin_hash))) {
    // الآن يُعرف صاحب الفشل، فيُقفل حسابه هو لا المقهى كلّه
    const tries = (u.failed_pin_attempts ?? 0) + 1;
    if (tries >= MAX_ATTEMPTS) {
      await db()`
        update users set failed_pin_attempts = 0,
               locked_until = now() + (${LOCK_MINUTES} || ' minutes')::interval
        where id = ${u.id}
      `;
      await audit(u.business_id, u.id, "login_locked", "user", u.id, "قفل بعد محاولات");
      return { ok: false, reason: "locked", minutes: LOCK_MINUTES };
    }
    await db()`update users set failed_pin_attempts = ${tries} where id = ${u.id}`;
    bumpDevice(deviceKey, gate);
    return { ok: false, reason: "bad_pin", remaining: MAX_ATTEMPTS - tries };
  }

  deviceFails.delete(deviceKey);
  await db()`
    update users
    set failed_pin_attempts = 0, locked_until = null, last_login_at = now()
    where id = ${u.id}
  `;
  await audit(u.business_id, u.id, "login", "user", u.id, null);
  setSession({ uid: u.id, bid: u.business_id, role: u.role, name: u.name });
  return { ok: true };
}

/** حدّ الجهاز — يُبطئ من يجرّب أسماءً ورموزاً بالجملة. */
function bumpDevice(
  deviceKey: string,
  gate: { n: number; until: number } | undefined
): LoginResult {
  const n = (gate?.n ?? 0) + 1;
  if (n >= MAX_ATTEMPTS) {
    deviceFails.set(deviceKey, { n: 0, until: Date.now() + LOCK_MINUTES * 60000 });
    return { ok: false, reason: "locked", minutes: LOCK_MINUTES };
  }
  deviceFails.set(deviceKey, { n, until: 0 });
  return { ok: false, reason: "bad_pin", remaining: MAX_ATTEMPTS - n };
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
