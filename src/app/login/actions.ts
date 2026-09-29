"use server";

import { cookies, headers } from "next/headers";
import { DEVICE_COOKIE, deviceKeyFromEnv, deviceTrusted } from "@/lib/device-gate";
import { loginByName, logout, type LoginResult } from "@/lib/auth";
import { redirect } from "next/navigation";

/**
 * مفتاح الجهاز لحدّ المحاولات.
 *
 * ليس هويّة ولا يُخزَّن: مجرّد مصدرٍ نُبطئ التخمين منه. ولو تعذّر
 * معرفته، مفتاحٌ واحد للجميع — تشديدٌ لا تساهل.
 */
function deviceKey(): string {
  const h = headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export async function loginAction(name: string, code: string): Promise<LoginResult> {
  // البوّابة في الوسيط تُخفي الشاشة، لكن الفعل الخادميّ يُستدعى بطلبٍ
  // مباشر لا يمرّ بشاشة — فالحارس هنا أيضاً. والرسالة كرسالة الرمز
  // الخاطئ: لا تقول لمن يجرّب إن الجهاز هو المشكلة.
  if (!(await deviceTrusted(cookies().get(DEVICE_COOKIE)?.value, deviceKeyFromEnv()))) {
    return { ok: false, reason: "not_found" };
  }
  return loginByName(name, code, deviceKey());
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
