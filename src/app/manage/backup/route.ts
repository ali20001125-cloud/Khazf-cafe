import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { buildBackupSql } from "@/lib/backup";

/**
 * تنزيل نسخة احتياطية كاملة.
 *
 * الصلاحية `settings.manage` — المالك وحده. والنسخة تحتوي كل شيء بما فيه
 * تهشير الرموز، فتنزيلها حدثٌ يُسجَّل في سجلّ التدقيق: من أخذ نسخة من
 * بيانات المقهى ومتى.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = currentUser();
  if (!user) return new Response("غير مصرّح", { status: 401 });
  if (!(await can(user, "settings.manage")))
    return new Response("لا تملك صلاحية أخذ نسخة", { status: 403 });

  try {
    const { sql, meta } = await buildBackupSql();

    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, entity_id, after, reason)
      values (${user.bid}, ${user.uid}, 'backup_downloaded', 'business', ${user.bid},
              ${JSON.stringify(meta)}::jsonb, 'تنزيل نسخة احتياطية')
    `;

    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    return new Response(sql, {
      headers: {
        "content-type": "application/sql; charset=utf-8",
        "content-disposition": `attachment; filename="khazaf-backup-${stamp}.sql"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر بناء النسخة";
    return new Response(`تعذّر بناء النسخة: ${msg}`, { status: 500 });
  }
}
