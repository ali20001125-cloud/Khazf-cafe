"use server";

import { headers } from "next/headers";
import { currentUser } from "@/lib/auth";
import { lockSession } from "@/lib/session";
import { loginByName, type LoginResult } from "@/lib/auth";
import { db } from "@/lib/db";

/**
 * قفل الشاشة.
 *
 * **القفل يُوسم في الكوكي الموقّع، لا يُرسم في المتصفّح.** ستارةٌ في
 * الصفحة تزول بزرّ التحديث، فمن ترك الكاشير مفتوحاً يبقى مفتوحاً لمن
 * يعرف ذلك الزرّ. والوسم لا يُزال من المتصفّح، و`requirePermission`
 * ترفض كل فعلٍ ما دام قائماً — وهي النقطة التي تمرّ بها كل الأفعال.
 *
 * ولا تُمحى الجلسة: لو مُحيت لأعادت الصفحة توجيهها إلى `/login` وضاعت
 * السلّة المفتوحة. فيبقى صاحبها معروفاً، وتعود الشاشة كما كانت بمجرّد
 * إدخال الرمز.
 */
export async function lockScreenAction(): Promise<{ ok: true }> {
  const u = currentUser();
  lockSession();

  if (u) {
    try {
      await db()`
        insert into audit_log (business_id, user_id, action, entity_type, reason)
        values (${u.bid}, ${u.uid}, 'screen_lock', 'session', 'قفل الشاشة')
      `;
    } catch {
      /* التدقيق لا يُفشل القفل */
    }
  }
  return { ok: true };
}

function deviceKey(): string {
  const h = headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * فتح القفل برمزٍ — أيّ رمزٍ صالح.
 *
 * قال المالك: «يدخل الباريستا رمزه مرّةً ثانية، أو المالك إذا احتاج».
 * فهذه هي شاشة الدخول نفسها بلا مغادرة الصفحة: من يفتح القفل يصير هو
 * صاحب الجلسة — ولو كان غير من أقفلها. ولها حدّ المحاولات نفسه، فلا
 * تصير باباً خلفياً أضعف من الباب الأمامي.
 */
export async function unlockScreenAction(name: string, code: string): Promise<LoginResult> {
  return loginByName(name, code, deviceKey());
}
