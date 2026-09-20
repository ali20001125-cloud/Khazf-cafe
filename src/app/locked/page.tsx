import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import LockScreen from "@/components/LockScreen";

export const dynamic = "force-dynamic";

/**
 * وجهة إعادة الكتابة حين تكون الجلسة مقفلة.
 *
 * لا تجلب شيئاً ولا تعرض شيئاً غير لوحة الأرقام — فما لا يُجلب لا
 * يُسرَّب. وإن لم تكن الجلسة مقفلةً فعلاً (رابطٌ كُتب بالكيبورد) لا
 * يبقى المستخدم هنا عالقاً.
 */
export default function LockedPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!user.lk) redirect("/");
  return <LockScreen userName={user.name} />;
}
