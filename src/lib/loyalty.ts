import "server-only";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { normalizePhone, maskPhone } from "./phone";

export { normalizePhone, maskPhone };

/**
 * الولاء — المواصفة §37–§47.
 *
 * حدود لا تُكسَر (مفروضة في القاعدة أيضاً، هجرة 0014):
 * - **التسجيل ذاتي**: الزبون يسجّل نفسه برقم هاتفه ورمز تحقّق. الباريستا
 *   لا يُنشئ حساباً ولا يعدّل رصيداً ولا يقرأ الرمز.
 * - **الرصيد مشتقّ** من `loyalty_ledger`، لا عمود أختام قابل للتعديل.
 * - **المكافأة تُصدَر تلقائياً** عند اكتمال العتبة، وتُصرف مرّة واحدة.
 */

// ── رمز التحقّق ──────────────────────────────────────────────────────
const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_RESEND_SECONDS = 60;

export type OtpRequest =
  | { ok: true; expiresInMinutes: number; devCode?: string }
  | { ok: false; error: string };

/**
 * يُنشئ رمزاً ويُخزّنه **مُهشّراً**. الرمز الصريح يُرسل للزبون فقط.
 * رمز نشط واحد لكل رقم (فهرس فريد جزئي في القاعدة يفرضه).
 */
export async function requestOtp(businessId: string, rawPhone: string): Promise<OtpRequest> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "رقم الهاتف غير صحيح" };

  const blocked = (await db()`
    select 1 from customers
    where business_id = ${businessId} and phone = ${phone} and blocked
  `) as unknown[];
  if (blocked.length) return { ok: false, error: "هذا الرقم غير مؤهّل للتسجيل" };

  // حدّ معدّل: رمز واحد كل دقيقة لنفس الرقم
  const recent = (await db()`
    select 1 from otp_codes
    where business_id = ${businessId} and phone = ${phone}
      and created_at > now() - (${OTP_RESEND_SECONDS} || ' seconds')::interval
  `) as unknown[];
  if (recent.length) return { ok: false, error: "أرسلنا رمزاً قبل قليل — انتظر دقيقة" };

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = await bcrypt.hash(code, 10);

  // رمز نشط واحد: نستهلك القديم قبل إدراج الجديد
  await db()`
    update otp_codes set consumed_at = now()
    where business_id = ${businessId} and phone = ${phone} and consumed_at is null
  `;
  await db()`
    insert into otp_codes (business_id, phone, code_hash, expires_at)
    values (${businessId}, ${phone}, ${hash},
            now() + (${OTP_TTL_MINUTES} || ' minutes')::interval)
  `;

  await sendOtp(phone, code);

  return {
    ok: true,
    expiresInMinutes: OTP_TTL_MINUTES,
    // في التطوير فقط: يظهر الرمز حتى تُجرَّب الشاشة بلا مزوّد رسائل.
    devCode: process.env.NODE_ENV === "production" ? undefined : code,
  };
}

/**
 * إرسال الرمز عبر واتساب.
 *
 * **مزوّد الرسائل غير محسوم بعد** (المواصفة §37 تقول «OTP عبر WhatsApp» بلا
 * تسمية مزوّد). حتى يُحسم: يُسجَّل خادمياً فقط، والشاشة تُظهره في التطوير.
 * عند اختيار المزوّد (Meta Cloud API / Twilio / …) يُستبدل جسم هذه الدالة
 * وحدها — لا شيء آخر يتغيّر.
 */
async function sendOtp(phone: string, code: string): Promise<void> {
  if (process.env.NODE_ENV !== "production") {
    console.log(`[loyalty] رمز التحقّق لـ${maskPhone(phone)}: ${code}`);
    return;
  }
  console.log(`[loyalty] طلب رمز لـ${maskPhone(phone)} — لا مزوّد رسائل مضبوط بعد`);
}

export type OtpVerify =
  | { ok: true; phone: string; stamps: number; rewards: number; isNew: boolean }
  | { ok: false; error: string };

/** يتحقّق من الرمز وينشئ حساب الولاء إن لم يكن موجوداً. */
export async function verifyOtp(
  businessId: string,
  rawPhone: string,
  code: string,
  name?: string
): Promise<OtpVerify> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return { ok: false, error: "رقم الهاتف غير صحيح" };
  if (!/^\d{6}$/.test(code ?? "")) return { ok: false, error: "الرمز ستّة أرقام" };

  const rows = (await db()`
    select id, code_hash, attempts, expires_at < now() as expired
    from otp_codes
    where business_id = ${businessId} and phone = ${phone} and consumed_at is null
    order by created_at desc limit 1
  `) as { id: string; code_hash: string; attempts: number; expired: boolean }[];

  const otp = rows[0];
  if (!otp) return { ok: false, error: "لا يوجد رمز فعّال — اطلب رمزاً جديداً" };
  if (otp.expired) return { ok: false, error: "انتهت صلاحية الرمز — اطلب رمزاً جديداً" };
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await db()`update otp_codes set consumed_at = now() where id = ${otp.id}`;
    return { ok: false, error: "محاولات كثيرة — اطلب رمزاً جديداً" };
  }

  if (!(await bcrypt.compare(code, otp.code_hash))) {
    await db()`update otp_codes set attempts = attempts + 1 where id = ${otp.id}`;
    const left = OTP_MAX_ATTEMPTS - otp.attempts - 1;
    return { ok: false, error: left > 0 ? `رمز خاطئ — بقيت ${left} محاولات` : "رمز خاطئ" };
  }

  await db()`update otp_codes set consumed_at = now() where id = ${otp.id}`;

  const existing = (await db()`
    select id from customers where business_id = ${businessId} and phone = ${phone}
  `) as { id: string }[];

  let customerId: string;
  let isNew = false;
  if (existing[0]) {
    customerId = existing[0].id;
    await db()`
      update customers
         set phone_verified_at = now(),
             name = coalesce(nullif(${name ?? ""}, ''), name)
       where id = ${customerId}
    `;
  } else {
    const created = (await db()`
      insert into customers (business_id, phone, name, phone_verified_at, source)
      values (${businessId}, ${phone}, ${name || null}, now(), 'self_signup')
      returning id
    `) as { id: string }[];
    customerId = created[0].id;
    isNew = true;
  }

  await db()`
    insert into loyalty_accounts (business_id, customer_id)
    values (${businessId}, ${customerId})
    on conflict (customer_id) do nothing
  `;

  const acc = await findAccountByPhone(businessId, phone);
  return {
    ok: true,
    phone,
    stamps: acc?.stamps_display ?? 0,
    rewards: acc?.rewards_available ?? 0,
    isNew,
  };
}

// ── ما يراه الباريستا ────────────────────────────────────────────────
export type LoyaltyAccountView = {
  account_id: string;
  customer_id: string;
  phone: string;
  name: string | null;
  status: string;
  stamps_display: number;
  rewards_available: number;
};

/**
 * بحث الكاشير برقم الهاتف. **لا يُعيد أي مبلغ ولا تاريخ شراء** (§38 · §44):
 * أختام ومكافآت فقط. `stamps_display` مقصوص عند صفر (§47).
 */
export async function findAccountByPhone(
  businessId: string,
  rawPhone: string
): Promise<LoyaltyAccountView | null> {
  const phone = normalizePhone(rawPhone);
  if (!phone) return null;
  const rows = (await db()`
    select account_id, customer_id, phone, name, status, stamps_display, rewards_available
    from v_loyalty_accounts
    where business_id = ${businessId} and phone = ${phone} and status = 'ACTIVE'
  `) as LoyaltyAccountView[];
  return rows[0] ?? null;
}

export type AvailableReward = { id: string; kind: string; issued_at: string };

export async function listAvailableRewards(accountId: string): Promise<AvailableReward[]> {
  return (await db()`
    select id, kind, issued_at from loyalty_rewards
    where account_id = ${accountId} and status = 'AVAILABLE'
    order by issued_at
  `) as AvailableReward[];
}

/** حركات الحساب — للمالك فقط (تدقيق §46). */
export type LedgerEntry = {
  created_at: string;
  type: string;
  stamps_delta: number;
  reason: string | null;
  order_number: number | null;
};

export async function accountLedger(accountId: string): Promise<LedgerEntry[]> {
  return (await db()`
    select l.created_at, l.type::text as type, l.stamps_delta, l.reason, o.order_number
    from loyalty_ledger l
    left join orders o on o.id = l.order_id
    where l.account_id = ${accountId}
    order by l.created_at desc
    limit 50
  `) as LedgerEntry[];
}
