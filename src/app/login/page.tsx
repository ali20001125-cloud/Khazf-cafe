import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { getSettings, strSetting } from "@/lib/settings";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

/**
 * شاشة الدخول: رمزٌ واحد، بلا أسماء.
 *
 * لم تعد تقرأ من `users` شيئاً — فلا قائمةَ تُسرَّب، ولا صفحةٌ تُخبر
 * من فتحها كم حساباً في المقهى ولا ما أدوارهم.
 */
export default async function LoginPage() {
  if (currentUser()) redirect("/");
  const settings = await getSettings();
  const shop = strSetting(settings, "shop_name", "مقهى خزف");

  return (
    <main className="flex min-h-screen flex-col">
      <div className="topbar px-6 pb-14 pt-16 text-center">
        <div className="font-display text-5xl font-bold tracking-tight text-cream">خزف</div>
        <div className="mt-1 text-sm tracking-[0.35em] text-cream/60">C A F É</div>
      </div>

      <div className="mx-auto -mt-8 w-full max-w-sm px-6 pb-12">
        <div className="card p-6 shadow-lift">
          <p className="mb-6 text-center text-sm text-muted">أدخل رمزك</p>
          <LoginForm />
        </div>
        <p className="mt-4 text-center text-xs text-muted/70">{shop}</p>
      </div>
    </main>
  );
}
