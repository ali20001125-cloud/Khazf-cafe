import "server-only";
import { db } from "./db";
import { OWNER_ONLY, RISKY, type PermRow } from "./permission-labels";

/**
 * قراءة صلاحيات الباريستا من القاعدة (§51).
 * النصوص والتصنيف في `permission-labels.ts` لتستوردها الواجهة أيضاً.
 */

export async function baristaPermissions(businessId: string): Promise<PermRow[]> {
  const rows = (await db()`
    select p.key, p.scope, p.label,
           exists (
             select 1 from role_permissions rp
             join roles r on r.id = rp.role_id
             where r.business_id = ${businessId} and r.key = 'barista'
               and rp.permission = p.key
           ) as granted
    from permissions p
    order by p.scope, p.key
  `) as { key: string; scope: string; label: string; granted: boolean }[];

  return rows.map((r) => ({
    ...r,
    ownerOnly: OWNER_ONLY[r.key] ?? null,
    risk: RISKY[r.key] ?? null,
  }));
}
