"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";

/**
 * عدّ المالك لدرج وردية أُغلقت بانتظاره (هجرة 0026).
 *
 * يُقاس المعدود على المتوقّع **المحفوظ لحظة الإغلاق** لا على حسابٍ جديد:
 * لو حُسب الآن لاختلف بحركاتٍ وقعت بعدها، فظهر فرقٌ لا علاقة له بالوردية.
 */
export type CountResult =
  | { ok: true; counted: number; expected: number; variance: number }
  | { ok: false; error: string };

export async function countClosedShiftAction(
  shiftId: string,
  counted: number
): Promise<CountResult> {
  let user;
  try {
    user = await requirePermission("cash.view_expected");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!Number.isFinite(counted) || counted < 0)
    return { ok: false, error: "المبلغ غير صالح" };

  try {
    const rows = (await db()`
      select count_closed_shift(${shiftId}, ${user.uid}, ${Math.round(counted)}) as r
    `) as { r: { counted: number; expected: number; variance: number } }[];
    revalidatePath("/manage");
    revalidatePath(`/manage/shifts/${shiftId}`);
    return { ok: true, ...rows[0].r };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر تسجيل العدّ";
    return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
  }
}
