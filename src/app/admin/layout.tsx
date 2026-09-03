import Link from "next/link";
import { isAdmin } from "@/lib/admin-auth";
import { logout } from "./actions";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!isAdmin()) {
    return (
      <main className="min-h-[100dvh] flex items-center justify-center p-4">
        <LoginForm />
      </main>
    );
  }

  return (
    <div className="min-h-[100dvh]">
      <header className="bg-white border-b border-line">
        <div className="max-w-5xl mx-auto flex items-center gap-3 p-3 flex-wrap">
          <Link href="/admin" className="font-bold ml-auto">
            لوحة المالك
          </Link>
          <Link href="/admin/materials" className="text-sm px-3 py-2 rounded-lg border border-line">
            المواد
          </Link>
          <Link href="/admin/drinks" className="text-sm px-3 py-2 rounded-lg border border-line">
            المشروبات
          </Link>
          <Link href="/admin/settings" className="text-sm px-3 py-2 rounded-lg border border-line">
            الإعدادات
          </Link>
          <Link href="/pos" className="text-sm px-3 py-2 rounded-lg border border-line">
            شاشة البيع
          </Link>
          <form action={logout}>
            <button className="text-sm px-3 py-2 rounded-lg border border-line text-red-700">خروج</button>
          </form>
        </div>
      </header>
      <main className="max-w-5xl mx-auto p-4">{children}</main>
    </div>
  );
}
