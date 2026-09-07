"use server";

import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { getActiveBranch } from "@/lib/branch";
import { getOpenShift } from "@/lib/shifts";
import {
  findAccountByPhone,
  listAvailableRewards,
  type LoyaltyAccountView,
  type AvailableReward,
} from "@/lib/loyalty";

/**
 * الولاء من شاشة الكاشير (المواصفة §38 · §42 · §44).
 *
 * الباريستا يملك `loyalty.view_customer` و`loyalty.redeem` فقط:
 * يبحث ويصرف. **لا ينشئ حساباً ولا يضيف أختاماً ولا يُنشئ مكافأة** —
 * تلك تحتاج `loyalty.manage` وهي للمالك، والقاعدة تفرض الباقي.
 */

export type LookupResult =
  | { ok: true; account: LoyaltyAccountView; rewards: AvailableReward[] }
  | { ok: false; error: string };

export async function lookupCustomer(phone: string): Promise<LookupResult> {
  let user;
  try {
    user = await requirePermission("loyalty.view_customer");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const account = await findAccountByPhone(user.bid, phone);
  if (!account) {
    return {
      ok: false,
      error: "لا يوجد حساب بهذا الرقم — الزبون يسجّل بنفسه من رمز QR",
    };
  }
  const rewards = await listAvailableRewards(account.account_id);
  return { ok: true, account, rewards };
}

export type RedeemInput = {
  rewardId: string;
  productId: string;
  cropMaterialId: string;
  fulfillment: "takeaway" | "dine_in";
  idempotencyKey: string;
};

export type RedeemResult =
  | { ok: true; orderNumber: number; replay: boolean }
  | { ok: false; error: string };

/**
 * صرف مكافأة: طلب مستقلّ بإجمالي 0، دفع بطريقة `loyalty`، والمخزون ينقص
 * طبيعياً — **بلا حركة كاش وبلا فتح درج** (§43). كل ذلك في معاملة واحدة
 * داخل `redeem_reward()`.
 */
export async function redeemReward(input: RedeemInput): Promise<RedeemResult> {
  let user;
  try {
    user = await requirePermission("loyalty.redeem");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!input.rewardId || !input.productId || !input.cropMaterialId)
    return { ok: false, error: "اختر المشروب والمحصول" };
  if (!input.idempotencyKey) return { ok: false, error: "مفتاح صرف مفقود" };

  try {
    const branch = await getActiveBranch(user.bid);
    if (!branch) return { ok: false, error: "لا يوجد فرع فعّال" };
    if (branch.pos_locked) return { ok: false, error: "الكاشير مقفل من قبل المالك" };

    const shift = await getOpenShift(branch.id);
    if (!shift) return { ok: false, error: "افتح الوردية أولاً" };

    const rows = (await db()`
      select redeem_reward(
        ${user.bid}, ${branch.id}, ${user.uid}, ${shift.id},
        ${input.rewardId}, ${input.productId}, ${input.cropMaterialId},
        ${input.fulfillment}, ${input.idempotencyKey}
      ) as result
    `) as { result: { order_number: number; replay: boolean } }[];

    const r = rows[0].result;
    return { ok: true, orderNumber: r.order_number, replay: r.replay };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "تعذّر صرف المكافأة";
    return { ok: false, error: msg.replace(/^.*?:\s*/, "") };
  }
}
