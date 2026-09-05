import "server-only";
import { cookies } from "next/headers";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";
import type { UserRole } from "./types";

/**
 * جلسة موقّعة بكوكي httpOnly (HMAC). لا حالة على الخادم.
 * الحمولة: معرّف المستخدم + العمل + الدور + الاسم + وقت الإصدار.
 */

export const SESSION_COOKIE = "khazf_session";
const MAX_AGE_SECONDS = 8 * 60 * 60; // وردية كاملة

export type SessionData = {
  uid: string;
  bid: string; // business_id
  role: UserRole;
  name: string;
  iat: number; // ثوانٍ
};

let warned = false;
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (!warned) {
    warned = true;
    // eslint-disable-next-line no-console
    console.warn(
      "[auth] SESSION_SECRET غير مضبوط (أو قصير) — يُستخدم سرّ تطوير. اضبطه في الإنتاج."
    );
  }
  return "khazf-cafe-dev-secret-change-me";
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function sign(body: string): string {
  return b64url(createHmac("sha256", secret()).update(body).digest());
}

function encode(data: SessionData): string {
  const body = b64url(Buffer.from(JSON.stringify(data), "utf8"));
  return `${body}.${sign(body)}`;
}

function decode(token: string): SessionData | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as SessionData;
    if (typeof data.iat !== "number") return null;
    if (Date.now() / 1000 - data.iat > MAX_AGE_SECONDS) return null; // انتهت
    return data;
  } catch {
    return null;
  }
}

export function setSession(data: Omit<SessionData, "iat">): void {
  const payload: SessionData = { ...data, iat: Math.floor(Date.now() / 1000) };
  cookies().set(SESSION_COOKIE, encode(payload), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export function readSession(): SessionData | null {
  const v = cookies().get(SESSION_COOKIE)?.value;
  return v ? decode(v) : null;
}

export function clearSession(): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** لتوليد سرّ للإنتاج. */
export function generateSecret(): string {
  return b64url(randomBytes(32));
}
