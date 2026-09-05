import { redirect } from "next/navigation";
import Link from "next/link";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function ManageLayout({ children }: { children: React.ReactNode }) {
  const user = currentUser();
  if (!user) redirect("/login");
  if (user.role !== "owner") redirect("/");

  return (
    <div dir="rtl" className="min-h-screen">
      <header className="topbar px-5 py-5">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/manage" className="font-display text-xl font-bold text-cream">
            خزف <span className="text-sm font-normal text-cream/50">· الإدارة</span>
          </Link>
          <Link href="/" className="chip border border-cream/20 bg-cream/5 px-4 py-2 text-cream/80">
            الرئيسية ←
          </Link>
        </div>
      </header>
      <div className="mx-auto max-w-3xl px-4 py-6">{children}</div>
    </div>
  );
}
