import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const user = currentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");

  return (
    <div dir="rtl" className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6 flex items-center justify-between">
        <Link href="/manage" className="text-lg font-bold text-[#5b4636]">
          الإدارة
        </Link>
        <Link href="/" className="text-sm text-neutral-500">
          ← الرئيسية
        </Link>
      </header>
      {children}
    </div>
  );
}
