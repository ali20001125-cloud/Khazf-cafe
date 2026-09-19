"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

// قائمة بيضاء لما يخصّ **العمل كلّه**. ما يخصّ الفرع (الفكّة · ساعة بداية
// اليوم · عتبة الفروقات) بيته `branches` ويُعدَّل من `branch-actions.ts`
// — إعداد بمكانين يعني أن المالك قد يغيّر واحداً بينما يقرأ النظام الآخر.
const ALLOWED = new Set([
  "shop_name", "shop_phone", "staff_drink_limit", "session_timeout_minutes",
  // كانت تُزرع «IQD» وتظهر في كل سعرٍ وفاتورة بلا سبيلٍ لتغييرها
  "currency",
  // كلفة تغليف طلب البضاعة — قال المالك إنها تتغيّر كل فترة، فمكانها
  // لوحته لا هجرةٌ في القاعدة
  "retail_packaging_cost",
]);

export async function updateSettingsAction(
  patch: Record<string, unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("settings.manage");
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

/**
 * تصفير بيانات التجربة.
 *
 * أخطر زرّ في النظام، ولذلك ثلاثة حرّاس متتالية: صلاحية المالك هنا، ودورٌ
 * ثانٍ يُفحص داخل القاعدة، وكلمة «تصفير» تُكتب بالحرف. والقاعدة هي من
 * يمسح لا الخادم — فالعملية كلّها معاملة واحدة تقع أو لا تقع.
 */
export async function resetTransactionsAction(
  confirm: string
): Promise<{ ok: true; deleted: Record<string, number> } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("settings.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (confirm.trim() !== "تصفير")
    return { ok: false, error: "اكتب كلمة «تصفير» للتأكيد" };

  try {
    const rows = (await db()`
      select reset_transactions(${user.bid}, ${user.uid}, ${confirm.trim()}) as r
    `) as { r: { ok: boolean; deleted: Record<string, number> } }[];

    // كل صفحة تقرأ أرقاماً صارت كاذبة الآن
    for (const p of ["/manage", "/manage/orders", "/manage/profit", "/manage/sales",
                     "/manage/inventory", "/manage/shopping", "/manage/hours",
                     "/manage/exceptions", "/manage/settings", "/pos"]) {
      revalidatePath(p);
    }
    return { ok: true, deleted: rows[0]?.r?.deleted ?? {} };
  } catch (e) {
    const msg = e instanceof Error ? e.message.replace(/^.*?:\s*/, "") : "تعذّر التصفير";
    return { ok: false, error: msg };
  }
}
