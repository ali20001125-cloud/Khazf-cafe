"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError, clearPermissionCache } from "@/lib/permissions";
import { verifyOwnerPin } from "@/lib/approvals";
import { OWNER_ONLY } from "@/lib/permission-labels";

/**
 * منح صلاحية للباريستا أو سحبها (§51 · §52).
 *
 * كل تغيير يطلب رمز المالك ويُكتب في سجلّ التدقيق: «من وسّع صلاحيات من
 * ومتى» سؤالٌ يُسأل بعد شهرٍ حين يظهر فرق.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function setBaristaPermissionAction(
  permission: string,
  grant: boolean,
  ownerPin: string
): Promise<ActionResult> {
  let user;
  try {
    user = await requirePermission("users.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (grant && OWNER_ONLY[permission])
    return { ok: false, error: OWNER_ONLY[permission] };

  const approvedBy = await verifyOwnerPin(user.bid, ownerPin);
  if (!approvedBy) return { ok: false, error: "رمز المالك غير صحيح" };

  try {
    const perm = (await db()`
      select key, label from permissions where key = ${permission}
    `) as { key: string; label: string }[];
    if (!perm[0]) return { ok: false, error: "صلاحية غير معروفة" };

    const role = (await db()`
      select id from roles where business_id = ${user.bid} and key = 'barista'
    `) as { id: string }[];
    if (!role[0]) return { ok: false, error: "دور الباريستا غير موجود" };

    if (grant) {
      await db()`
        insert into role_permissions (role_id, permission)
        values (${role[0].id}, ${permission})
        on conflict do nothing
      `;
    } else {
      await db()`
        delete from role_permissions
        where role_id = ${role[0].id} and permission = ${permission}
      `;
    }

    await db()`
      insert into audit_log (business_id, user_id, approved_by, action,
                             entity_type, entity_id, after, reason)
      values (${user.bid}, ${user.uid}, ${approvedBy},
              ${grant ? "permission_granted" : "permission_revoked"},
              'role', ${role[0].id},
              ${JSON.stringify({ permission, label: perm[0].label })}::jsonb,
              ${`${grant ? "منح" : "سحب"} «${perm[0].label}» للباريستا`})
    `;

    clearPermissionCache();
    revalidatePath("/manage/users");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "تعذّر التغيير" };
  }
}
