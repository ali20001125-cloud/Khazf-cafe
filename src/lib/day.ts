import "server-only";
import { db } from "./db";
import { todayGlance } from "./reports";
import { openShiftsCount } from "./reports";

/** إغلاق اليوم المحاسبي (المواصفة §الوردية واليوم). */
export async function closeDay(
  branchId: string,
  userId: string
): Promise<{ ok: true; totals: unknown } | { ok: false; error: string }> {
  const open = await openShiftsCount(branchId);
  if (open > 0) return { ok: false, error: "أغلق كل الورديات المفتوحة أولاً" };

  const totals = await todayGlance(branchId);
  try {
    await db()`
      insert into day_closes (branch_id, business_day, closed_by, totals)
      values (
        ${branchId},
        (now() at time zone 'Asia/Baghdad')::date,
        ${userId},
        ${JSON.stringify(totals)}::jsonb
      )
    `;
    return { ok: true, totals };
  } catch {
    return { ok: false, error: "اليوم مغلق بالفعل" };
  }
}

export async function isTodayClosed(branchId: string): Promise<boolean> {
  const r = (await db()`
    select 1 from day_closes
    where branch_id = ${branchId}
      and business_day = (now() at time zone 'Asia/Baghdad')::date
    limit 1
  `) as unknown[];
  return r.length > 0;
}
