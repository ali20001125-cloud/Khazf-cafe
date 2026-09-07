"use server";

import { db } from "@/lib/db";
import { requestOtp, verifyOtp } from "@/lib/loyalty";

/**
 * تسجيل الولاء الذاتي (المواصفة §37) — **صفحة عامة بلا جلسة موظف**.
 *
 * الزبون يفتحها من رمز QR في المحل أو من رابط موقع خزف، ويسجّل نفسه.
 * لا يمرّ شيء من هذا عبر الباريستا: لا إنشاء حساب، ولا رمز يُقرأ من الكاشير.
 *
 * ما يحمي الصفحة (وهي مكشوفة للإنترنت):
 * - رمز مُهشّر بمهلة عشر دقائق وحدّ خمس محاولات.
 * - رمز واحد كل دقيقة لكل رقم.
 * - لا تُعيد أي بيانات عن أرقام غير مُتحقَّقة (لا تعداد للزبائن).
 */

/** العمل الوحيد الآن؛ خطّاف تعدّد الأعمال لاحقاً. */
async function resolveBusinessId(): Promise<string | null> {
  const rows = (await db()`
    select id from businesses order by created_at limit 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}

export type SendCodeResult =
  | { ok: true; devCode?: string }
  | { ok: false; error: string };

export async function sendCode(phone: string): Promise<SendCodeResult> {
  const bid = await resolveBusinessId();
  if (!bid) return { ok: false, error: "الخدمة غير متاحة حالياً" };

  const r = await requestOtp(bid, phone);
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, devCode: r.devCode };
}

export type ConfirmResult =
  | { ok: true; stamps: number; rewards: number; isNew: boolean }
  | { ok: false; error: string };

export async function confirmCode(
  phone: string,
  code: string,
  name: string
): Promise<ConfirmResult> {
  const bid = await resolveBusinessId();
  if (!bid) return { ok: false, error: "الخدمة غير متاحة حالياً" };

  const r = await verifyOtp(bid, phone, code, name.trim().slice(0, 60));
  if (!r.ok) return { ok: false, error: r.error };
  return { ok: true, stamps: r.stamps, rewards: r.rewards, isNew: r.isNew };
}
