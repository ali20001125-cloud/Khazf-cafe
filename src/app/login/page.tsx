import { redirect } from "next/navigation";
import { listLoginUsers, currentUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (currentUser()) redirect("/");
  const users = await listLoginUsers();
  return (
    <main className="flex min-h-screen flex-col">
      {/* هيرو داكن دافئ */}
      <div className="topbar px-6 pb-14 pt-16 text-center">
        <div className="font-display text-5xl font-bold tracking-tight text-cream">خزف</div>
        <div className="mt-1 text-sm tracking-[0.35em] text-cream/60">C A F É</div>
      </div>
      {/* بطاقة الدخول ترفع فوق الهيرو */}
      <div className="mx-auto -mt-8 w-full max-w-sm px-6 pb-12">
        <div className="card p-6 shadow-lift">
          <p className="mb-6 text-center text-sm text-muted">اختر اسمك وأدخل رمزك</p>
          <LoginForm users={users} />
        </div>
      </div>
    </main>
  );
}
