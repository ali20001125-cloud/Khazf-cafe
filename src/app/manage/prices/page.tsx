import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { priceRows } from "@/lib/prices";
import { getSettings, strSetting } from "@/lib/settings";
import PriceEditor from "@/components/PriceEditor";

export const dynamic = "force-dynamic";

export default async function PricesPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "products.manage"))) redirect("/");

  const [rows, settings] = await Promise.all([priceRows(user.bid), getSettings()]);

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link href="/manage" className="navlink text-sm text-muted hover:text-ink">
          ← لوحة الإدارة
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">الأسعار</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          كل سعرٍ في المحلّ في مكانٍ واحد. غيّر رقماً، أو ارفع الكلّ بنسبة —
          وانظر الربح وهو يتغيّر قبل أن تحفظ.
        </p>
      </div>

      <PriceEditor rows={rows} currency={strSetting(settings, "currency", "د.ع")} />
    </div>
  );
}
