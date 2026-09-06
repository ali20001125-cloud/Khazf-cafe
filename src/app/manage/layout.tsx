import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import ManageSidebar from "@/components/ManageSidebar";

export const dynamic = "force-dynamic";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const user = currentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");

  return (
    <div dir="rtl" className="flex min-h-screen flex-col lg:flex-row">
      <ManageSidebar userName={user.name} />
      <main className="flex-1 overflow-x-hidden px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
