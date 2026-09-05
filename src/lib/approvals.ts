import "server-only";
import bcrypt from "bcryptjs";
import { db } from "./db";

/**
 * تحقّق من رمز المالك للموافقة على عملية حسّاسة (تجاوز حدّ/إلغاء/إرجاع/خصم).
 * يُرجع معرّف المالك الموافِق أو null.
 */
export async function verifyOwnerPin(businessId: string, pin: string): Promise<string | null> {
  if (!pin) return null;
  const owners = (await db()`
    select id, pin_hash from users
    where business_id = ${businessId} and role = 'owner' and active
  `) as { id: string; pin_hash: string }[];
  for (const o of owners) {
    if (await bcrypt.compare(pin, o.pin_hash)) return o.id;
  }
  return null;
}
