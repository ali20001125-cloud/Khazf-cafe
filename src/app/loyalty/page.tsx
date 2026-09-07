import { db } from "@/lib/db";
import { getSettings, strSetting } from "@/lib/settings";
import LoyaltySignup from "@/components/LoyaltySignup";

/**
 * صفحة تسجيل الولاء — **عامة** (المواصفة §37).
 * يفتحها الزبون من رمز QR في المحل أو من رابط موقع خزف. لا تحتاج دخولاً،
 * ولا تعرض شيئاً عن المحل غير اسمه وعتبة المكافأة.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "نادي خزف",
  description: "سجّل رقمك واجمع أختامك",
};

export default async function LoyaltyPage() {
  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");

  let stampsPerReward = 5;
  try {
    const rows = (await db()`
      select (value->>'stamps_per_reward')::int as n
      from settings where branch_id is null and key = 'loyalty' limit 1
    `) as { n: number | null }[];
    if (rows[0]?.n) stampsPerReward = rows[0].n;
  } catch {
    // العتبة الافتراضية تكفي لو تعذّرت القراءة
  }

  return <LoyaltySignup shopName={shop} stampsPerReward={stampsPerReward} />;
}
