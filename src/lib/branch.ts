import "server-only";
import { db } from "./db";

/** الفرع الفعّال للعمل (الآن فرع واحد؛ خطّاف التوسّع). */
export async function getActiveBranchId(businessId: string): Promise<string | null> {
  const rows = (await db()`
    select id from branches where business_id = ${businessId} and active
    order by created_at limit 1
  `) as { id: string }[];
  return rows[0]?.id ?? null;
}
