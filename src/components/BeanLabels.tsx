"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateBeanLabelsAction } from "@/app/manage/menu-actions";

export type Bean = {
  id: string;
  /** اسمه عندك — في المخزون والجرد والتكاليف. لا يُعدَّل من هنا. */
  name: string;
  /** اسمه على الطاولة. */
  label: string;
  note: string | null;
};

/**
 * ما يُسمّى البنّ في المنيو.
 *
 * اسم المخزن واسم الطاولة شيئان: أنت تشتري «حبوب كالدي» وتعدّه بهذا
 * الاسم، والزبون يقرأ ما تختار أن يقرأه.
 *
 * وافتراضُنا الصمت — «حبوب قهوة مختصّة» — لأن المحصول قرارٌ يومي
 * يُتّخذ في الخلف: من قرأ «كالدي» على الطاولة جاء غداً يطلبه، فإمّا
 * أن تلزمك حبّةٌ نفدت وإمّا أن تُخلف وعداً لم تقصد قطعه.
 *
 * فإن أردت يوماً أن تقول المحصول — وهو ما يُقرأ في مقهىً مختصّ —
 * فاكتبه هنا حين تكون واثقاً أنه باقٍ.
 */
export default function BeanLabels({ beans }: { beans: Bean[] }) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, string>>(() =>
    Object.fromEntries(beans.map((b) => [b.id, b.label]))
  );
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const changed = beans.filter((b) => state[b.id].trim() !== b.label);

  function save() {
    if (pending || changed.length === 0) return;
    setError(null);
    setMsg(null);
    start(async () => {
      const res = await updateBeanLabelsAction(
        changed.map((b) => ({ id: b.id, label: state[b.id] }))
      );
      if (!res.ok) return setError(res.error);
      setMsg("تم الحفظ ✅");
      router.refresh();
    });
  }

  if (beans.length === 0) return null;

  return (
    <section className="card p-5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="tap flex w-full items-start justify-between gap-3 text-right"
      >
        <span className="min-w-0">
          <span className="block font-display font-bold text-ink">
            اسم البنّ في المنيو
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-muted">
            الزبون يقرأ «حبوب قهوة مختصّة» — لا «كالدي» ولا «الدورادو».
            المحصول قرارك في الخلف، وذكرُه على الطاولة وعدٌ بأنه باقٍ غداً.
          </span>
        </span>
        <span className="shrink-0 pt-1 text-muted">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          {beans.map((b) => (
            <div key={b.id} className="rounded-xl border border-line bg-cream p-3">
              <p className="text-xs text-muted">
                عندك في المخزون: <span className="font-medium text-ink">{b.name}</span>
              </p>
              <input
                className="field mt-2 text-sm"
                placeholder="حبوب قهوة مختصّة"
                maxLength={60}
                value={state[b.id]}
                onChange={(e) => setState({ ...state, [b.id]: e.target.value })}
              />
              {b.note && (
                <p className="mt-1.5 text-[0.7rem] leading-relaxed text-muted">
                  وتحته: {b.note}
                </p>
              )}
            </div>
          ))}

          {error && (
            <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
              {error}
            </div>
          )}
          {msg && changed.length === 0 && (
            <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-700">
              {msg}
            </div>
          )}

          <button
            onClick={save}
            disabled={pending || changed.length === 0}
            className="btn-ghost w-full py-2.5 text-sm disabled:opacity-40"
          >
            {pending ? "..." : changed.length === 0 ? "لا تغييرات" : `حفظ ${changed.length}`}
          </button>
        </div>
      )}
    </section>
  );
}
