"use server";

import { login, logout, type LoginResult } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function loginAction(userId: string, pin: string): Promise<LoginResult> {
  return login(userId, pin);
}

export async function logoutAction(): Promise<void> {
  await logout();
  redirect("/login");
}
