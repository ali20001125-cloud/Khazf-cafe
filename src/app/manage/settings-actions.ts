"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

// المفاتيح المسموح تعديلها من اللوحة (قائمة بيضاء)
const ALLOWED = new Set([
  "shop_name", "shop_phone", "standard_float", "staff_drink_limit",
  "extra_shot_price", "shot_grams", "session_timeout_minutes",
  "variance_thresholds", "low_stock_alert",
]);

export async function updateSettingsAction(
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("change_settings");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const entries = Object.entries(patch).filter(([k]) => ALLOWED.has(k));
  if (entries.length === 0) return { ok: false, error: "لا تغييرات" };

  try {
    for (const [key, value] of entries) {
      await db()`
        insert into settings (business_id, branch_id, key, value)
        values (${user.bid}, ${null}, ${key}, ${JSON.stringify(value)}::jsonb)
        on conflict (business_id, key) where branch_id is null
        do update set value = excluded.value
      `;
    }
    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, reason)
      values (${user.bid}, ${user.uid}, 'settings_change', 'settings', ${entries.map(([k]) => k).join(", ")})
    `;
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}
