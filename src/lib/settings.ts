import "server-only";
import { db } from "./db";

export type Settings = Record<string, unknown>;

const FALLBACK: Record<string, unknown> = {
  currency: "د.ع",
  shop_name: "مقهى خزف",
  shop_phone: "",
  extra_shot_price: [500],
  shot_grams: [9],
};

export async function getSettings(): Promise<Settings> {
  const out: Settings = { ...FALLBACK };
  try {
    const rows = (await db()`select key, value from settings`) as {
      key: string;
      value: unknown;
    }[];
    for (const row of rows) out[row.key] = row.value;
  } catch {
    // الإعدادات ليست حرجة: نكمل بالقيم الافتراضية
  }
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
