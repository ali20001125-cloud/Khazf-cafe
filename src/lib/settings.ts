import "server-only";
import { db } from "./supabase";

export type Settings = Record<string, unknown>;

const FALLBACK: Record<string, unknown> = {
  currency: "د.ع",
  shop_name: "مقهى خزف",
  shop_phone: "",
  extra_shot_price: [500],
  shot_grams: [9],
};

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db.from("settings").select("key, value");
  if (error || !data) return { ...FALLBACK };
  const out: Settings = { ...FALLBACK };
  for (const row of data) out[row.key as string] = (row as { value: unknown }).value;
  return out;
}

/** الإعدادات الرقمية مخزّنة كمصفوفة [n] حتى تبقى jsonb موحّدة. */
export function num(settings: Settings, key: string, fallback: number): number {
  const v = settings[key];
  if (Array.isArray(v) && typeof v[0] === "number") return v[0];
  if (typeof v === "number") return v;
  return fallback;
}

export function str(settings: Settings, key: string, fallback: string): string {
  const v = settings[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}
