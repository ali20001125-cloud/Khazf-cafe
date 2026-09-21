"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money, num, categoryLabel, kindName } from "@/lib/format";
import { updateMenuAction } from "@/app/manage/menu-actions";
import ImageField from "./ImageField";

export type Row = {
  id: string;
  name: string;
  category: string;
  kind: "drink" | "retail";
  paused: boolean;
  special: boolean;
  menuVisible: boolean;
  note: string | null;
  imageUrl: string | null;
  minPrice: number;
  maxPrice: number;
  variants: string[];
};

type St = { visible: boolean; note: string; special: boolean };

/** الحالة المحرَّرة مقابل الحالة المحفوظة — المقارنة بينهما تكشف ما تغيّر. */
const stOf = (r: Row): St => ({
  visible: r.menuVisible,
  note: r.note ?? "",
  special: r.special,
});

/**
 * تحرير المنيو.
 *
 * السعر معروضٌ هنا ولا يُعدَّل — لأنه بيته «المنتجات»، وسعرٌ يُكتب في
 * مكانين يتفرّق. ما يُحرَّر: أيّ منتجٍ يُعرض، وماذا يُقال تحته.
 *
 * والحفظ يرسل ما تغيّر وحده. إرسال كل الصفوف يعني كتابةً على منتجاتٍ لم
 * يلمسها أحد، وسطراً في سجلّ التدقيق يقول «عُدّل ١٢» حيث عُدّل واحد.
 */
export default function MenuEditor({
  rows,
  currency,
  menuUrl,
  qrSvg,
}: {
  rows: Row[];
  currency: string;
  menuUrl: string;
  qrSvg: string | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<Record<string, St>>(() =>
    Object.fromEntries(rows.map((r) => [r.id, stOf(r)]))
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const changed = rows.filter((r) => {
    const a = state[r.id];
    const b = stOf(r);
    return (
      a.visible !== b.visible ||
      a.note !== b.note ||
      a.special !== b.special
    );
  });
  const shown = rows.filter((r) => state[r.id].visible).length;

  function save() {
    if (pending || changed.length === 0) return;
    setError(null);
    setSaved(false);
    start(async () => {
      const res = await updateMenuAction(
        changed.map((r) => ({
          id: r.id,
          menu_visible: state[r.id].visible,
          menu_note: state[r.id].note,
          special: state[r.id].special,
        }))
      );
      if (!res.ok) return setError(res.error);
      setSaved(true);
      router.refresh();
    });
  }

  const drinks = rows.filter((r) => r.kind === "drink");
  const goods = rows.filter((r) => r.kind === "retail");

  return (
    <div className="space-y-6">
      {/* الرمز */}
      <section className="card p-6">
        <h2 className="font-display font-bold text-ink">رمز المنيو</h2>
        <p className="mt-1 text-sm text-muted">
          اطبعه وضعه على الطاولات. الزبون يمسحه بكاميرا هاتفه فيفتح المنيو —
          بلا تطبيق ولا تسجيل. وحين يتغيّر السعر عندك يتغيّر عنده، فالورقة
          لا تُعاد طباعتها.
        </p>

        <div className="mt-5 flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {qrSvg ? (
            <div
              className="shrink-0 rounded-2xl border border-line bg-cream p-3"
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />
          ) : (
            <div className="rounded-2xl border border-line bg-sand p-6 text-center text-xs text-muted">
              يظهر الرمز بعد النشر على رابط ثابت.
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted">رابط المنيو</p>
            <p className="mt-1 break-all rounded-xl bg-sand px-3 py-2 font-mono text-sm text-ink">
              {menuUrl}
            </p>
            <a
              href="/menu"
              target="_blank"
              rel="noreferrer"
              className="btn-ghost mt-3 inline-block px-4 py-2 text-sm"
            >
              افتح المنيو كما يراه الزبون ←
            </a>
          </div>
        </div>
      </section>

      {/* ما يُعرض */}
      <section className="card p-5">
        <div className="mb-1 flex items-baseline justify-between">
          <h2 className="font-display font-bold text-ink">ما يظهر في المنيو</h2>
          <span className="nums text-xs text-muted">
            {shown} من {rows.length}
          </span>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted">
          الأسعار تُقرأ من «المنتجات» ولا تُكتب هنا — سعرٌ في مكانين يتفرّق.
          والصورة اختيارية: بلا صورةٍ يُرسم المشروب برسمٍ من ألوان خزف، فلا
          يبقى مربّعٌ فارغ ولا ينكسر شيء. وحين تريدها: «أضف صورة» يفتح كاميرا
          هاتفك أو استوديوه، وتُصغَّر عندك ثمّ تُرفع وحدها — بلا زرّ حفظ.
        </p>

        <div className="space-y-2">
          {drinks.map((r) => (
            <Item
              key={r.id}
              row={r}
              currency={currency}
              st={state[r.id]}
              set={(v) => setState({ ...state, [r.id]: v })}
            />
          ))}
        </div>

        {goods.length > 0 && (
          <>
            <h3 className="mb-2 mt-5 text-xs font-semibold text-muted">البضاعة</h3>
            <div className="space-y-2">
              {goods.map((r) => (
                <Item
                  key={r.id}
                  row={r}
                  currency={currency}
                  st={state[r.id]}
                  set={(v) => setState({ ...state, [r.id]: v })}
                />
              ))}
            </div>
          </>
        )}
      </section>

      {error && <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>}
      {saved && changed.length === 0 && (
        <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-700">
          تم الحفظ ✅
        </div>
      )}

      <button
        onClick={save}
        disabled={pending || changed.length === 0}
        className="btn-primary w-full disabled:opacity-40"
      >
        {pending ? "..." : changed.length === 0 ? "لا تغييرات" : `حفظ ${changed.length}`}
      </button>
    </div>
  );
}

function Item({
  row,
  currency,
  st,
  set,
}: {
  row: Row;
  currency: string;
  st: St;
  set: (v: St) => void;
}) {
  const kinds = row.variants.map(kindName).filter((v, i, a) => a.indexOf(v) === i);
  // عملةٌ واحدة في آخر المدى، و`dir="ltr"` عليه: «٢٬٠٠٠ IQD — ٤٬٠٠٠ IQD»
  // وسط نصٍّ عربي يقلبه المتصفّح فيُقرأ معكوساً
  const price =
    row.minPrice === row.maxPrice
      ? money(row.minPrice, currency)
      : `${num(row.minPrice)} — ${money(row.maxPrice, currency)}`;

  return (
    <div
      className={`rounded-xl border p-3 ${
        st.visible ? "border-line bg-cream" : "border-line/60 bg-sand/50"
      }`}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => set({ ...st, visible: !st.visible })}
          aria-pressed={st.visible}
          className={`tap mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
            st.visible ? "justify-start bg-accent" : "justify-end bg-line"
          }`}
        >
          {/* الموضع بالمحاذاة لا بـ`translate-x`: المحاذاة تعرف اتجاه
              الصفحة، والإزاحة لا — فالمقبض يقع عند البداية (اليمين هنا)
              حين يظهر المنتج، بلا حسابِ بكسلاتٍ يُخطئ في اتجاهٍ آخر. */}
          <span className="block h-5 w-5 rounded-full bg-cream shadow transition-transform" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span className={`font-medium ${st.visible ? "text-ink" : "text-muted"}`}>
              {row.name}
            </span>
            <span dir="ltr" className="nums text-xs text-muted">{price}</span>
            <span className="rounded-full bg-sand px-2 py-0.5 text-[0.65rem] text-muted">
              {categoryLabel(row.category)}
            </span>
            {row.paused && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[0.65rem] text-amber-900">
                موقوف — يظهر «غير متوفّر»
              </span>
            )}
          </div>
          {kinds.length > 1 && (
            <p className="mt-0.5 text-xs text-accentdeep">{kinds.join(" · ")}</p>
          )}
          <input
            className="field mt-2 text-sm"
            placeholder="سطرٌ تحت الاسم — «إسبريسو مزدوج وحليب مبخّر»"
            maxLength={160}
            value={st.note}
            onChange={(e) => set({ ...st, note: e.target.value })}
            disabled={!st.visible}
          />

          {/*
            الصورة تُرفع من الهاتف ولا يُلصق رابطها.
            الرابط كان خطأً من أصله: صورةٌ على موقع غيرك تُحذف أو تُحجب
            فيرى الزبون مربّعاً مكسوراً، ولا تعرف أنت متى وقع ذلك.
            ولذلك ترفع نفسها فور اختيارها — لا تنتظر زرّ «حفظ» الذي
            يحفظ النصوص، فالملفّ لا يُحمَل في حالة الشاشة.
          */}
          <ImageField
            productId={row.id}
            productName={row.name}
            category={row.category}
            kind={row.kind}
            imageUrl={row.imageUrl}
            disabled={!st.visible}
          />

          <button
            type="button"
            onClick={() => set({ ...st, special: !st.special })}
            aria-pressed={st.special}
            disabled={!st.visible}
            className={`tap mt-2 rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
              st.special
                ? "bg-dark text-cream"
                : "border border-line bg-sand text-muted"
            }`}
          >
            {st.special ? "★ مميّز — بطاقة بعرض الشاشة" : "اجعله مميّزاً"}
          </button>
        </div>
      </div>
    </div>
  );
}
