"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { requirePermission, AuthError } from "@/lib/permissions";
import { verifyOwnerPin } from "@/lib/approvals";

/**
 * إدارة المستخدمين والرموز (المواصفة §51 · §52).
 *
 * الرمز عندنا **هويّة**، لا كلمة مرور فقط: هو ما يُثبت من دخل، ومن وافق على
 * إلغاء فاتورة، ومن أذن بإرجاع مال. ولذلك:
 *
 * ١. **لا يُقرأ رمزٌ أبداً** — لا للمالك ولا في أي شاشة. التهشير طريق واحد.
 *    المالك لا «يرى» رمز الباريستا، بل **يعيّن** واحداً جديداً.
 * ٢. **لا رمزان متشابهان** — وإلا صار «من فعلها؟» سؤالاً بلا جواب.
 * ٣. **لا حذف مستخدم** — يُعطَّل فقط. فاسمه معلّق على فواتير وورديات
 *    وحركات كاش، وحذفه يمسح تاريخاً لا يُستعاد.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

const MIN_PIN = 4;
const MAX_PIN = 8;

/** رموز يحفظها كل من رأى كاشيراً — لا تُقبل ولو كان صاحبها مصمّماً عليها. */
const BANNED_PINS = new Set([
  "0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888", "9999",
  "1234", "4321", "0123", "3210", "1212", "2121", "1122", "0101", "1010",
  "12345", "123456", "654321", "111111", "000000",
]);

function validatePin(pin: string): string | null {
  if (!/^\d+$/.test(pin)) return "الرمز أرقام فقط";
  if (pin.length < MIN_PIN || pin.length > MAX_PIN)
    return `الرمز بين ${MIN_PIN} و${MAX_PIN} أرقام`;
  if (BANNED_PINS.has(pin))
    return "رمز مكشوف — هذا من أول ما يُجرَّب. اختر غيره";
  if (/^(\d)\1+$/.test(pin)) return "رقم واحد مكرّر — اختر غيره";
  return null;
}

/**
 * هل هذا الرمز مستخدم لشخص آخر؟ الفحص هنا لا في القاعدة: القاعدة لا تخزّن
 * إلا التهشير، وتمريرُ الرمز الصريح إليها يكتبه في سجلاتها.
 */
async function pinTakenBy(
  businessId: string,
  pin: string,
  exceptUserId: string | null
): Promise<string | null> {
  const rows = (await db()`
    select id, name, pin_hash from users
    where business_id = ${businessId} and active
  `) as { id: string; name: string; pin_hash: string }[];
  for (const u of rows) {
    if (u.id === exceptUserId) continue;
    if (await bcrypt.compare(pin, u.pin_hash)) return u.name;
  }
  return null;
}

async function audit(
  businessId: string,
  userId: string,
  approvedBy: string | null,
  action: string,
  targetId: string,
  after: Record<string, unknown>,
  reason: string
): Promise<void> {
  await db()`
    insert into audit_log (business_id, user_id, approved_by, action,
                           entity_type, entity_id, after, reason)
    values (${businessId}, ${userId}, ${approvedBy}, ${action},
            'user', ${targetId}, ${JSON.stringify(after)}::jsonb, ${reason})
  `;
}

// ── كل مستخدم يغيّر رمزه بنفسه ───────────────────────────────────────
// الباريستا يحتاج هذا: رمزه الحالي 0000، ولا يجوز أن ينتظر المالك ليغيّره.
export async function changeMyPinAction(
  currentPin: string,
  newPin: string
): Promise<ActionResult> {
  const user = currentUser();
  if (!user) return { ok: false, error: "انتهت الجلسة — سجّل الدخول من جديد" };

  const bad = validatePin(newPin);
  if (bad) return { ok: false, error: bad };

  try {
    const rows = (await db()`
      select pin_hash from users where id = ${user.uid} and active
    `) as { pin_hash: string }[];
    if (!rows[0]) return { ok: false, error: "المستخدم غير موجود" };

    if (!(await bcrypt.compare(currentPin ?? "", rows[0].pin_hash)))
      return { ok: false, error: "الرمز الحالي غير صحيح" };

    if (await bcrypt.compare(newPin, rows[0].pin_hash))
      return { ok: false, error: "هذا رمزك الحالي — لم يتغيّر شيء" };

    const clash = await pinTakenBy(user.bid, newPin, user.uid);
    if (clash)
      return {
        ok: false,
        error: `هذا الرمز لـ${clash}. الرمز هويّة — لو تشابه رمزان لما عرفنا من وافق على الإلغاء`,
      };

    const hash = await bcrypt.hash(newPin, 10);
    await db()`
      update users
      set pin_hash = ${hash}, pin_changed_at = now(),
          failed_pin_attempts = 0, locked_until = null
      where id = ${user.uid}
    `;
    await audit(user.bid, user.uid, null, "pin_changed", user.uid, {}, "تغيير الرمز الشخصي");

    revalidatePath("/manage/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر تغيير الرمز" };
  }
}

// ── المالك يعيّن رمزاً جديداً لموظف نسي رمزه ──────────────────────────
export async function resetUserPinAction(
  targetUserId: string,
  newPin: string,
  ownerPin: string
): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("users.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const bad = validatePin(newPin);
  if (bad) return { ok: false, error: bad };

  const approvedBy = await verifyOwnerPin(user.bid, ownerPin);
  if (!approvedBy) return { ok: false, error: "رمز المالك غير صحيح" };

  try {
    const rows = (await db()`
      select id, name from users where id = ${targetUserId} and business_id = ${user.bid}
    `) as { id: string; name: string }[];
    if (!rows[0]) return { ok: false, error: "الموظف غير موجود" };

    const clash = await pinTakenBy(user.bid, newPin, targetUserId);
    if (clash) return { ok: false, error: `هذا الرمز لـ${clash} — اختر غيره` };

    const hash = await bcrypt.hash(newPin, 10);
    await db()`
      update users
      set pin_hash = ${hash}, pin_changed_at = now(),
          failed_pin_attempts = 0, locked_until = null
      where id = ${targetUserId}
    `;
    await audit(user.bid, user.uid, approvedBy, "pin_reset", targetUserId,
                { target: rows[0].name }, `المالك عيّن رمزاً جديداً لـ${rows[0].name}`);

    revalidatePath("/manage/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر تعيين الرمز" };
  }
}

// ── إضافة موظف ───────────────────────────────────────────────────────
export async function createUserAction(input: {
  name: string;
  role: "owner" | "barista";
  pin: string;
  ownerPin: string;
}): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("users.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "الاسم قصير" };

  const bad = validatePin(input.pin);
  if (bad) return { ok: false, error: bad };

  const approvedBy = await verifyOwnerPin(user.bid, input.ownerPin);
  if (!approvedBy) return { ok: false, error: "رمز المالك غير صحيح" };

  try {
    const clash = await pinTakenBy(user.bid, input.pin, null);
    if (clash) return { ok: false, error: `هذا الرمز لـ${clash} — اختر غيره` };

    const hash = await bcrypt.hash(input.pin, 10);
    const rows = (await db()`
      insert into users (business_id, name, role, pin_hash, pin_changed_at)
      values (${user.bid}, ${name}, ${input.role}, ${hash}, now())
      returning id
    `) as { id: string }[];
    const newId = rows[0].id;

    // بلا وصول لفرع لا يستطيع الدخول للعمل
    await db()`
      insert into user_branch_access (user_id, branch_id)
      select ${newId}, b.id from branches b where b.business_id = ${user.bid}
    `;

    await audit(user.bid, user.uid, approvedBy, "user_created", newId,
                { name, role: input.role }, `إضافة ${input.role === "owner" ? "مالك" : "باريستا"}: ${name}`);

    revalidatePath("/manage/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّرت الإضافة" };
  }
}

// ── تعطيل/تفعيل — لا حذف ─────────────────────────────────────────────
export async function setUserActiveAction(
  targetUserId: string,
  active: boolean,
  ownerPin: string,
  reason: string
): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("users.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!reason.trim()) return { ok: false, error: "اذكر السبب — يُقرأ بعد شهر" };
  if (targetUserId === user.uid)
    return { ok: false, error: "لا تعطّل نفسك — لن تستطيع الدخول بعدها" };

  const approvedBy = await verifyOwnerPin(user.bid, ownerPin);
  if (!approvedBy) return { ok: false, error: "رمز المالك غير صحيح" };

  try {
    const rows = (await db()`
      select id, name, role::text as role from users
      where id = ${targetUserId} and business_id = ${user.bid}
    `) as { id: string; name: string; role: string }[];
    const target = rows[0];
    if (!target) return { ok: false, error: "الموظف غير موجود" };

    // آخر مالك نشط لا يُعطَّل: لا يبقى أحد يملك الصلاحيات
    if (!active && target.role === "owner") {
      const owners = (await db()`
        select count(*)::int as n from users
        where business_id = ${user.bid} and role = 'owner' and active and id <> ${targetUserId}
      `) as { n: number }[];
      if (owners[0].n === 0)
        return { ok: false, error: "هذا آخر مالك نشط — تعطيله يُقفل النظام على الجميع" };
    }

    // وردية مفتوحة لا تُترك بلا صاحب
    if (!active) {
      const open = (await db()`
        select count(*)::int as n from shifts
        where status = 'OPEN' and (employee_id = ${targetUserId} or drawer_owner_id = ${targetUserId})
      `) as { n: number }[];
      if (open[0].n > 0)
        return { ok: false, error: "له وردية مفتوحة — أغلقها أولاً، وإلا بقي درج بلا مسؤول" };
    }

    await db()`update users set active = ${active} where id = ${targetUserId}`;
    await audit(user.bid, user.uid, approvedBy,
                active ? "user_enabled" : "user_disabled", targetUserId,
                { name: target.name }, reason.trim());

    revalidatePath("/manage/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر التغيير" };
  }
}

// ── فكّ قفل بعد خمس محاولات خاطئة ─────────────────────────────────────
export async function unlockUserAction(targetUserId: string): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("users.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  try {
    await db()`
      update users set failed_pin_attempts = 0, locked_until = null
      where id = ${targetUserId} and business_id = ${user.bid}
    `;
    await audit(user.bid, user.uid, null, "user_unlocked", targetUserId, {}, "فكّ القفل");
    revalidatePath("/manage/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر فكّ القفل" };
  }
}
