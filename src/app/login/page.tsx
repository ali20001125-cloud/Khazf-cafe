import { redirect } from "next/navigation";
import { listLoginUsers, currentUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (currentUser()) redirect("/");
  const users = await listLoginUsers();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6 py-10">
      <h1 className="mb-1 text-center text-2xl font-bold text-[#5b4636]">مقهى خزف</h1>
      <p className="mb-8 text-center text-sm text-neutral-500">اختر اسمك وأدخل رمزك</p>
      <LoginForm users={users} />
    </main>
  );
}
