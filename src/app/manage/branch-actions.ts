"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";

/**
 * إعدادات الفرع (الفكّة · ساعة بداية اليوم · عتبة تنبيه الفروقات).
 * كلها للمالك وحده، وكلها تُسجَّل في `audit_log` لأن تغييرها يغيّر معنى
 * كل رقم بعدها: من يرفع الفكّة يبتلع فرقاً، ومن يزحزح ساعة البداية ينقل
 * مبيعات من يوم لآخر.
 */

export type BranchPatch = {
  standard_float: number;
  day_start_hour: number;
  variance_threshold_pct: number;
};

export async function updateBranchAction(
  patch: BranchPatch
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("settings.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const float = Math.round(Number(patch.standard_float));
  const hour = Math.round(Number(patch.day_start_hour));
  const pct = Number(patch.variance_threshold_pct);

  if (!Number.isFinite(float) || float < 0) return { ok: false, error: "الفكّة غير صالحة" };
  if (!Number.isInteger(hour) || hour < 0 || hour > 23)
    return { ok: false, error: "ساعة بداية اليوم بين ٠ و٢٣" };
  if (!Number.isFinite(pct) || pct < 0 || pct > 100)
    return { ok: false, error: "العتبة نسبة بين ٠ و١٠٠" };

  try {
    const branch = await getActiveBranch(user.bid);
    if (!branch) return { ok: false, error: "لا يوجد فرع فعّال" };

    const before = {
      standard_float: branch.standard_float,
      day_start_hour: branch.day_start_hour,
      variance_threshold_pct: branch.variance_threshold_pct,
    };

    await db()`
      update branches
         set standard_float = ${float},
             day_start_hour = ${hour},
             variance_threshold_pct = ${pct}
       where id = ${branch.id}
    `;

    await db()`
      insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id,
                             before, after, reason)
      values (${user.bid}, ${branch.id}, ${user.uid}, 'settings_change', 'branch', ${branch.id},
              ${JSON.stringify(before)}::jsonb,
              ${JSON.stringify({ standard_float: float, day_start_hour: hour, variance_threshold_pct: pct })}::jsonb,
              'إعدادات الفرع')
    `;

    revalidatePath("/manage/settings");
    revalidatePath("/manage");
    return { ok: true };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}
