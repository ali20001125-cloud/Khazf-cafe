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
 * الدخول بالرمز وحده — بلا قائمة أسماء.
 *
 * كانت الشاشة تعرض «المالك» و«الباريستا» بأسمائهما. وهذا يُعلن للغريب
 * أنّ ثمّة حساب مالك وما اسمه، فيعرف أيّ بابٍ يطرق. ويُعلن للباريستا
 * كل يومٍ أنّ فوقه حساباً رمزُه هو نفسه رمز الموافقة على الإلغاء
 * والإرجاع — وإغراء التخمين يبدأ من معرفة أنّ الهدف موجود.
 *
 * والرموز فريدة أصلاً (`pinTakenBy` تمنع التكرار عند الإنشاء)، فالرمز
 * وحده يكفي للتعرّف. هكذا تعمل صناديق البيع في العالم: رمزٌ واحد،
 * والنظام يعرف صاحبه.
 *
 * وحدّ المحاولات هنا لا يمكن أن يكون على المستخدم — فالرمز الخاطئ لا
 * يخصّ أحداً. فهو على الجهاز: عدّادٌ في ذاكرة الخادم لكل مصدر، يُبطئ
 * التخمين بلا أن يقفل المقهى على نفسه لو عبث أحدٌ من بعيد.
 */
const deviceFails = new Map<string, { n: number; until: number }>();

export async function loginByPin(pin: string, deviceKey: string): Promise<LoginResult> {
  const now = Date.now();
  const gate = deviceFails.get(deviceKey);
  if (gate && gate.until > now) {
    return { ok: false, reason: "locked", minutes: Math.max(1, Math.ceil((gate.until - now) / 60000)) };
  }

  const clean = (pin ?? "").trim();
  if (clean.length < 4) return { ok: false, reason: "not_found" };

  const rows = (await db()`
    select id, business_id, name, role, pin_hash, active, failed_pin_attempts, locked_until
    from users where active
  `) as Row[];

  for (const u of rows) {
    if (!(await bcrypt.compare(clean, u.pin_hash))) continue;

    // الحساب قد يكون مقفلاً بمحاولاتٍ سابقة عليه هو
    if (u.locked_until && new Date(u.locked_until).getTime() > now) {
      const minutes = Math.max(1, Math.ceil((new Date(u.locked_until).getTime() - now) / 60000));
      return { ok: false, reason: "locked", minutes };
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

  const n = (gate?.n ?? 0) + 1;
  if (n >= MAX_ATTEMPTS) {
    deviceFails.set(deviceKey, { n: 0, until: now + LOCK_MINUTES * 60000 });
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
