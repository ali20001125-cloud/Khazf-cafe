import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listStaff } from "@/lib/users";
import StaffManager from "@/components/StaffManager";

/**
 * الموظفون والرموز (§51 · §52).
 *
 * يدخلها كل مستخدم ليغيّر رمزه بنفسه — الباريستا يحتاج ذلك، ولا يجوز أن
 * ينتظر المالك. أما إضافة موظف وتعيين رمز لغيرك فتحتاج `users.manage`.
 */
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const user = currentUser();
  if (!user) redirect("/login");

  const canManage = await can(user, "users.manage");
  const staff = canManage
    ? await listStaff(user.bid)
    : (await listStaff(user.bid)).filter((u) => u.id === user.uid);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-xl font-bold text-ink">الموظفون والرموز</h1>
        <p className="mt-1 text-sm text-muted">
          الرمز ليس كلمة مرور فقط — هو ما يُثبت من دخل ومن وافق على إلغاء
          فاتورة. اجعله معروفاً لصاحبه وحده.
        </p>
      </header>

      <StaffManager staff={staff} meId={user.uid} canManage={canManage} />
    </div>
  );
}
