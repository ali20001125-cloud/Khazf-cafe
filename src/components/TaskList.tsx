import Link from "next/link";
import type { OwnerTask } from "@/lib/tasks";

/**
 * «ما يحتاج انتباهك» — أوّل ما يُرى في اللوحة.
 *
 * وموضعها في الأعلى مقصود: بقيّة اللوحة أرقامٌ تُقرأ حين يُراد، وهذه
 * أفعالٌ تُؤجَّل إن لم تُرَ. ولكل بند زرٌّ يذهب إلى الشاشة التي تُنجزه —
 * فلا يبقى على المالك أن يبحث عن مكان العلاج بعد أن عرف الداء.
 *
 * وحين تفرغ لا تُخفى: خلوّها خبرٌ أيضاً. الشاشة التي تختفي حين تهدأ
 * تترك المالك لا يدري أفحصَ النظام فوجد كل شيء سليماً، أم لم يفحص.
 */
export default function TaskList({ tasks }: { tasks: OwnerTask[] }) {
  if (tasks.length === 0) {
    return (
      <section className="card flex items-center gap-3 border-emerald-200 bg-emerald-50/50 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          ✓
        </span>
        <div>
          <p className="font-display font-bold text-emerald-900">لا شيء يحتاج انتباهك</p>
          <p className="mt-0.5 text-xs text-emerald-800/70">
            المخزون والرموز والدروج والأسعار — كلّها سليمة الآن.
          </p>
        </div>
      </section>
    );
  }

  const stops = tasks.filter((t) => t.tone === "stop").length;

  return (
    <section className="card overflow-hidden p-0">
      <div className="flex items-baseline justify-between border-b border-line px-5 py-3.5">
        <h2 className="font-display font-bold text-ink">ما يحتاج انتباهك</h2>
        <span className="nums text-xs text-muted">
          {stops > 0 ? `${stops} عاجل من ${tasks.length}` : `${tasks.length}`}
        </span>
      </div>

      <ul className="divide-y divide-line/70">
        {tasks.map((t) => (
          <li key={t.key}>
            <Link
              href={t.href}
              className="tap flex items-start gap-3 px-5 py-4 transition-colors hover:bg-sand/50"
            >
              <Dot tone={t.tone} />
              <div className="min-w-0 flex-1">
                <p className="font-medium leading-snug text-ink">{t.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{t.why}</p>
              </div>
              <span className="mt-0.5 shrink-0 whitespace-nowrap text-xs font-semibold text-accentdeep">
                {t.cta} ←
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * نقطةٌ ملوّنة، ومعها شكلٌ يختلف.
 *
 * اللون وحده لا يكفي: من لا يميّز الأحمر من الأصفر يرى نقطتين سواء.
 * فالعاجل مُصمَتٌ أكبر، والتحذير مجوَّف — يُفرَّق بالشكل قبل اللون.
 */
function Dot({ tone }: { tone: OwnerTask["tone"] }) {
  if (tone === "stop")
    return (
      <span
        aria-label="عاجل"
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500 ring-4 ring-red-500/15"
      />
    );
  if (tone === "warn")
    return (
      <span
        aria-label="تحذير"
        className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-amber-500"
      />
    );
  return (
    <span aria-label="معلومة" className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-line" />
  );
}
