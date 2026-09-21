import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { promoList } from "@/lib/promos";
import { getSettings, strSetting } from "@/lib/settings";
import PromoManager from "@/components/PromoManager";

export const dynamic = "force-dynamic";

export default async function PromosPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  // صلاحية المالك لا صلاحية الخصم: من يملك خصماً على فاتورة لا يملك
  // أن يصنع كوداً يخصم على مئة
  if (!(await can(user, "settings.manage"))) redirect("/");

  const [rows, settings] = await Promise.all([promoList(user.bid), getSettings()]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/manage" className="navlink text-sm text-muted hover:text-ink">
          ← لوحة الإدارة
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">أكواد الخصم</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          كودٌ يكتبه الباريستا في شاشة الدفع فيُحسم المبلغ. ولكلّ كودٍ سقفٌ
          بعدد المرّات وتاريخٌ ينتهي عنده — وكلاهما مطلوب.
        </p>
      </div>

      <PromoManager rows={rows} currency={strSetting(settings, "currency", "د.ع")} />
    </div>
  );
}
