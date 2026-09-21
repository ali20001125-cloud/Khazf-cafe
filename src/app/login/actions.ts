"use server";

import { headers } from "next/headers";
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
  return loginByName(name, code, deviceKey());
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
