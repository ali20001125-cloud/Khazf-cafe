import Link from "next/link";
import QRCode from "qrcode";
import { headers } from "next/headers";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { db } from "@/lib/db";
import { getSettings, strSetting } from "@/lib/settings";
import { timeAr } from "@/lib/format";

/**
 * الولاء — لوحة المالك.
 *
 * أهمّ ما فيها **رمز QR** يُطبع ويُلصق على الكاونتر: هو الباب الوحيد
 * لتسجيل الزبائن. الباريستا لا يُنشئ حسابات (§38)، فبلا هذا الرمز
 * المطبوع يبقى نظام الولاء معطّلاً مهما اشتغل خلف الكواليس.
 */
export const dynamic = "force-dynamic";

type Stats = {
  members: number;
  verified: number;
  stamps_outstanding: number;
  rewards_available: number;
  rewards_redeemed: number;
};

export default async function LoyaltyAdminPage() {
  const user = currentUser()!;
  if (!(await can(user, "loyalty.manage"))) {
    return <p className="card p-8 text-center text-red-600">لا تملك صلاحية إدارة الولاء.</p>;
  }

  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");

  const cfg = (await db()`
    select coalesce((value->>'stamps_per_reward')::int, 5) as per
    from settings where branch_id is null and key = 'loyalty' limit 1
  `) as { per: number }[];
  const stampsPerReward = cfg[0]?.per ?? 5;

  const rows = (await db()`
    select
      (select count(*) from loyalty_accounts where business_id = ${user.bid})::int as members,
      (select count(*) from customers
        where business_id = ${user.bid} and phone_verified_at is not null)::int as verified,
      (select coalesce(sum(stamps_delta), 0) from loyalty_ledger
        where business_id = ${user.bid})::int as stamps_outstanding,
      (select count(*) from loyalty_rewards
        where business_id = ${user.bid} and status = 'AVAILABLE')::int as rewards_available,
      (select count(*) from loyalty_rewards
        where business_id = ${user.bid} and status = 'REDEEMED')::int as rewards_redeemed
  `) as Stats[];
  const s = rows[0];

  const recent = (await db()`
    select c.phone, c.name, a.created_at,
           coalesce((select sum(l.stamps_delta) from loyalty_ledger l
                      where l.account_id = a.id), 0)::int as stamps
    from loyalty_accounts a join customers c on c.id = a.customer_id
    where a.business_id = ${user.bid}
    order by a.created_at desc limit 10
  `) as { phone: string; name: string | null; created_at: string; stamps: number }[];

  // الرابط الذي يفتحه الزبون — يُبنى من نفس المضيف الذي يزوره المالك الآن
  const h = headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const signupUrl = host ? `${proto}://${host}/loyalty` : "/loyalty";

  const qr = host
    ? await QRCode.toString(signupUrl, {
        type: "svg",
        margin: 1,
        width: 220,
        color: { dark: "#1C1A18", light: "#FBF7F0" },
      })
    : null;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/manage" className="text-sm text-muted hover:text-ink">← لوحة الإدارة</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">الولاء</h1>
        <p className="mt-1 text-sm text-muted">
          كل <span className="nums">{stampsPerReward}</span> مشروبات = مشروب مجاني.
        </p>
      </div>

      {/* رمز التسجيل */}
      <section className="card p-6" id="qr-card">
        <h2 className="font-display font-bold text-ink">رمز تسجيل الزبائن</h2>
        <p className="mt-1 text-sm text-muted">
          اطبع هذا الرمز وألصقه على الكاونتر. الزبون يمسحه، يُدخل رقمه، ويتحقّق برمز —
          ثم يقول للباريستا «عندي ولاء» ويعطيه رقمه في كل زيارة.
        </p>

        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {qr ? (
            <div
              className="shrink-0 rounded-2xl border border-line bg-cream p-3"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : (
            <div className="rounded-2xl border border-line bg-sand p-6 text-center text-xs text-muted">
              يظهر الرمز بعد النشر على رابط ثابت.
            </div>
          )}

          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">رابط التسجيل</p>
            <p className="mt-1 break-all rounded-xl bg-sand px-3 py-2 font-mono text-sm text-ink">
              {signupUrl}
            </p>
            <Link
              href="/loyalty"
              target="_blank"
              className="btn-ghost mt-3 inline-block px-4 py-2 text-sm"
            >
              افتح صفحة التسجيل كما يراها الزبون ←
            </Link>
          </div>
        </div>
      </section>

      {/* الأرقام */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="مشتركون" value={String(s.members)} />
        <Stat label="أختام لم تُصرف" value={String(s.stamps_outstanding)} />
        <Stat label="مكافآت متاحة" value={String(s.rewards_available)} />
        <Stat label="مكافآت صُرفت" value={String(s.rewards_redeemed)} />
      </div>

      {s.rewards_available > 0 && (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          <span className="nums font-semibold">{s.rewards_available}</span> مشروب مجاني مستحقّ
          لزبائنك ولم يُصرف بعد — هذا التزام قائم عليك، احسبه ضمن تكلفتك.
        </p>
      )}

      {/* آخر المشتركين */}
      <section className="card p-5">
        <h2 className="mb-3 font-display font-bold text-ink">آخر المشتركين</h2>
        {recent.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-muted">لا مشتركين بعد.</p>
            <p className="mt-1 text-xs text-muted">
              اطبع الرمز أعلاه وضعه على الكاونتر ليبدأ التسجيل.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((c, i) => (
              <li key={i} className="flex items-center justify-between py-2.5 text-sm">
                <span>
                  <span className="text-ink">{c.name || "زبون"}</span>
                  <span className="nums block text-[11px] text-muted">{c.phone}</span>
                </span>
                <span className="text-left">
                  <span className="nums font-medium text-ink">{Math.max(c.stamps, 0)}</span>
                  <span className="block text-[11px] text-muted">ختم</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="rounded-xl bg-sand p-4 text-xs leading-relaxed text-muted">
        <span className="font-semibold text-ink">لماذا لا يسجّل الباريستا الزبائن؟</span> لأن من
        يستطيع إنشاء حساب ومنح أختام يستطيع منح نفسه مشروبات مجانية. التسجيل ذاتي برقم
        الزبون ورمز تحقّق، والباريستا يبحث ويصرف فقط — وكل صرف مسجّل باسمه.
      </p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className="nums mt-1 font-display text-xl font-bold text-ink">{value}</p>
    </div>
  );
}
