"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { resetTransactionsAction } from "@/app/manage/settings-actions";

/**
 * تصفير بيانات التجربة.
 *
 * أخطر زرّ في اللوحة، فهو الوحيد الذي يُكتب فيه شيءٌ باليد قبل التنفيذ.
 * والشاشة تقول **ماذا يُحذف وماذا يبقى** قبل السؤال لا بعده: تأكيدٌ على
 * فعلٍ لا يعرف المستخدم مداه ليس تأكيداً.
 */
export default function ResetPanel({
  orders,
  payments,
  revenue,
  currency,
}: {
  orders: number;
  payments: number;
  revenue: number;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, number> | null>(null);
  const [pending, start] = useTransition();

  function run() {
    setError(null);
    start(async () => {
      const r = await resetTransactionsAction(word);
      if (!r.ok) return setError(r.error);
      setDone(r.deleted);
      setWord("");
      router.refresh();
    });
  }

  return (
    <section className="card border-red-200 p-5">
      <h2 className="font-display font-bold text-ink">تصفير بيانات التجربة</h2>
      <p className="mt-1 text-sm text-muted">
        قبل أن تفتح فعلاً — وبعد كل أيام تجربة. بيانات التجربة ليست محايدة:
        تدخل في أرباحك وفي متوسّط بيعك وفي معدّل استهلاك موادّك، فتقرأ أرقاماً
        مخلوطةً بلعب.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-red-50 p-3">
          <p className="text-xs font-semibold text-red-900">يُحذف</p>
          <p className="nums mt-1 text-sm text-red-900/80">
            {orders} طلب · {payments} دفعة ({revenue.toLocaleString("en-US")} {currency})
          </p>
          <p className="mt-1 text-xs text-red-900/60">
            وحركات المخزون والورديات والدرج والجرد وسجلّ التدقيق. ويصير رصيد كل
            مادة صفراً — تبدأ بشراء حقيقي.
          </p>
        </div>
        <div className="rounded-xl bg-emerald-50 p-3">
          <p className="text-xs font-semibold text-emerald-900">يبقى</p>
          <p className="mt-1 text-xs text-emerald-900/70">
            المشروبات والمحاصيل والوصفات والأسعار · وحدات الشراء وأسباب الهدر ·
            الموظفون ورموزهم وصلاحياتهم · كل الإعدادات.
          </p>
        </div>
      </div>

      <button onClick={() => { setOpen(true); setDone(null); setError(null); }}
              className="btn-ghost mt-4 w-full border-red-300 py-3 text-sm text-red-700">
        تصفير بيانات التجربة
      </button>

      {open && (
        <Modal title={done ? "تمّ التصفير" : "تأكيد التصفير"} onClose={() => setOpen(false)}>
          {done ? (
            <>
              <div className="rounded-2xl bg-emerald-50 p-4 text-center">
                <p className="font-display font-bold text-emerald-900">القاعدة نظيفة ✅</p>
                <p className="nums mt-2 text-sm text-emerald-800">
                  حُذف {done.orders ?? 0} طلب · {done.inventory ?? 0} حركة مخزون ·{" "}
                  {done.shifts ?? 0} وردية
                </p>
                <p className="mt-2 text-xs text-emerald-900/70">
                  أوّل فاتورة حقيقية رقمها ١٠٠١. ابدأ بتسجيل شراء موادّك.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="btn-primary mt-4 w-full py-3">
                تم
              </button>
            </>
          ) : (
            <>
              <p className="rounded-xl bg-red-50 p-3 text-sm text-red-900">
                هذا لا يُلغى. خُذ <span className="font-semibold">نسخة احتياطية</span> أوّلاً
                إن كان فيها ما تريد الرجوع إليه.
              </p>
              <label className="mb-1.5 mt-4 block text-sm font-semibold text-ink">
                اكتب كلمة <span className="text-red-700">تصفير</span> للتأكيد
              </label>
              <input
                className="field text-center text-lg"
                value={word}
                onChange={(e) => { setWord(e.target.value); setError(null); }}
                placeholder="تصفير"
              />
              {error && <p className="mt-3 text-center text-sm text-red-600">{error}</p>}
              <div className="mt-4 flex gap-2">
                <button onClick={() => setOpen(false)} className="btn-ghost flex-1 py-3">
                  رجوع
                </button>
                <button
                  onClick={run}
                  disabled={pending || word.trim() !== "تصفير"}
                  className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white disabled:opacity-30"
                >
                  {pending ? "…" : "احذف نهائياً"}
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
