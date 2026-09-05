import "server-only";
import { db } from "./db";

export type ActiveBranch = { id: string; name: string; pos_locked: boolean };

/** الفرع الفعّال للعمل (الآن فرع واحد؛ خطّاف التوسّع). */
export async function getActiveBranch(businessId: string): Promise<ActiveBranch | null> {
  const rows = (await db()`
    select id, name, pos_locked from branches
    where business_id = ${businessId} and active
    order by created_at limit 1
  `) as ActiveBranch[];
  return rows[0] ?? null;
}

export async function getActiveBranchId(businessId: string): Promise<string | null> {
  const b = await getActiveBranch(businessId);
  return b?.id ?? null;
}
