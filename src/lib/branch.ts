import "server-only";
import { db } from "./db";

/**
 * إعدادات الفرع.
 *
 * ما يخصّ الفرع يعيش هنا لا في `settings`: الفكّة القياسية، وساعة بداية
 * اليوم المحاسبي، وعتبة تنبيه فروقات الجرد. لكل واحد منها بيت واحد فقط
 * (هجرة 0019) — إعداد بمكانين يعني أن المالك قد يغيّر واحداً بينما يقرأ
 * النظام الآخر.
 */

export type ActiveBranch = {
  id: string;
  name: string;
  timezone: string;
  pos_locked: boolean;
  /** الفكّة الافتتاحية القياسية — يضعها المالك، والباريستا يؤكّدها فقط. */
  standard_float: number;
  /** الساعة التي يبدأ عندها اليوم المحاسبي (٠–٢٣). */
  day_start_hour: number;
  /** عتبة تنبيه فرق الجرد بالنسبة المئوية — تنبيه، لا «هدر مسموح». */
  variance_threshold_pct: number;
};

export async function getActiveBranch(businessId: string): Promise<ActiveBranch | null> {
  const rows = (await db()`
    select id, name, timezone, pos_locked, standard_float, day_start_hour,
           variance_threshold_pct::float8 as variance_threshold_pct
    from branches
    where business_id = ${businessId} and active
    order by created_at limit 1
  `) as ActiveBranch[];
  return rows[0] ?? null;
}

export async function getActiveBranchId(businessId: string): Promise<string | null> {
  const b = await getActiveBranch(businessId);
  return b?.id ?? null;
}
