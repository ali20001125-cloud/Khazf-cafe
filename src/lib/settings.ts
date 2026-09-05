import "server-only";
import { db } from "./db";

/** الإعدادات على مستوى العمل (branch_id = null). القيم jsonb عددية/نصية مباشرة. */
export type Settings = Record<string, unknown>;

const FALLBACK: Record<string, unknown> = {
  currency: "د.ع",
  shop_name: "مقهى خزف",
  shop_phone: "",
  staff_drink_limit: 1,
  session_timeout_minutes: 10,
  standard_float: 50000,
  extra_shot_price: 500,
  shot_grams: 9,
  low_stock_alert: true,
};

export async function getSettings(): Promise<Settings> {
  const out: Settings = { ...FALLBACK };
  try {
    const rows = (await db()`
      select key, value from settings where branch_id is null
    `) as { key: string; value: unknown }[];
    for (const row of rows) out[row.key] = row.value;
  } catch {
    // الإعدادات ليست حرجة: نكمل بالقيم الافتراضية
  }
  return out;
}

export function numSetting(s: Settings, key: string, fallback: number): number {
  const v = s[key];
  return typeof v === "number" ? v : fallback;
}

export function strSetting(s: Settings, key: string, fallback: string): string {
  const v = s[key];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

export function boolSetting(s: Settings, key: string, fallback: boolean): boolean {
  const v = s[key];
  return typeof v === "boolean" ? v : fallback;
}
