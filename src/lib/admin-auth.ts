import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE = "khazf_admin";

function secret(): string {
  return process.env.ADMIN_PIN ?? "";
}

function token(): string {
  return createHmac("sha256", secret()).update("khazf-admin-v1").digest("hex");
}

export function checkPin(pin: string): boolean {
  const expected = Buffer.from(secret());
  const given = Buffer.from(pin ?? "");
  if (expected.length === 0) return false;
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function sessionToken(): string {
  return token();
}

export function adminCookieName(): string {
  return COOKIE;
}

/** المرحلة ١: بوابة رمز واحد للمالك. تُستبدل بنظام الموظفين بالمرحلة ٣. */
export function isAdmin(): boolean {
  if (!secret()) return false;
  const jar = cookies();
  const v = jar.get(COOKIE)?.value;
  if (!v) return false;
  const a = Buffer.from(v);
  const b = Buffer.from(token());
  return a.length === b.length && timingSafeEqual(a, b);
}
