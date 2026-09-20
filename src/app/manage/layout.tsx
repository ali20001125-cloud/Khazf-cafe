import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getSettings, numSetting } from "@/lib/settings";
import ManageSidebar from "@/components/ManageSidebar";
import IdleLock from "@/components/IdleLock";

export const dynamic = "force-dynamic";

export default async function ManageLayout({ children }: { children: React.ReactNode }) {
  const user = currentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");

  // اللوحة تُقفل كما يُقفل الكاشير — وهي أخطر: فيها الأرباح والرموز
  // والتصفير. وجهاز المالك يُترك مفتوحاً كما يُترك جهاز الكاونتر.
  const idleMinutes = numSetting(await getSettings(), "session_timeout_minutes", 10);

  return (
    <div dir="rtl" className="flex min-h-screen flex-col lg:flex-row">
      <IdleLock minutes={idleMinutes} userName={user.name} />
      <ManageSidebar userName={user.name} />
      <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
