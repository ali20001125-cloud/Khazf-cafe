import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { feedbackInbox } from "@/lib/feedback";
import FeedbackInbox from "@/components/FeedbackInbox";

export const dynamic = "force-dynamic";

export default async function FeedbackPage() {
  const user = currentUser();
  if (!user) redirect("/login");
  if (!(await can(user, "reports.view"))) redirect("/");

  const rows = await feedbackInbox(user.bid);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <Link href="/manage" className="navlink text-sm text-muted hover:text-ink">
          ← لوحة الإدارة
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">آراء الزبائن</h1>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          يكتبها الزبون من ذيل المنيو، وتصلك أنت وحدك. لا نجوم على المنيو
          ولا تعليقات يراها الزبائن — رأيٌ يُقرأ ويُتصرَّف فيه، لا دعاية.
        </p>
      </div>

      <FeedbackInbox rows={rows} />
    </div>
  );
}
