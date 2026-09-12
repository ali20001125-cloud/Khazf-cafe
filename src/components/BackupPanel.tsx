"use client";

import { num } from "@/lib/format";

/**
 * لوحة النسخ الاحتياطي.
 *
 * تقول الحقيقة غير المريحة أولاً: نافذة الاسترجاع على Neon **٦ ساعات**.
 * صاحب المقهى يستحقّ أن يعرف حدود ما يحميه، لا أن يطمئن لحماية لا يعرف
 * مداها. والزرّ هنا هو ما يجعل النسخة **خارج** القاعدة — ونسخةٌ تسكن مع
 * أصلها ليست نسخة.
 */
export default function BackupPanel({
  tables,
  rows,
  lastBackupAt,
}: {
  tables: number;
  rows: number;
  lastBackupAt: string | null;
}) {
  return (
    <section className="card p-5">
      <h2 className="font-display text-sm font-bold text-ink">النسخة الاحتياطية</h2>

      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
        <p className="text-sm font-semibold text-amber-900">
          الاسترجاع التلقائي يغطّي آخر ٦ ساعات فقط
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-900/80">
          هذا ما تمنحه خطة القاعدة الحالية. فلو حدث خطأ ليلاً ولاحظته صباحاً،
          تكون النافذة قد أُغلقت. والنسخة التي تسكن مع أصلها ليست نسخة — فنزّل
          ملفاً واحفظه عندك: على حاسبتك أو في بريدك أو على ذاكرة خارجية.
        </p>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="text-xs text-muted">الجداول</dt>
          <dd className="nums font-display font-bold text-ink">{num(tables)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">الصفوف (تقديري)</dt>
          <dd className="nums font-display font-bold text-ink">{num(rows)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-xs text-muted">
        {lastBackupAt
          ? `آخر نسخة نُزّلت: ${lastBackupAt}`
          : "لم تُنزَّل أي نسخة بعد."}
      </p>

      {/* رابط لا زرّ: التنزيل مسار GET، فينزّله المتصفّح بلا جافاسكربت */}
      <a
        href="/manage/backup"
        download
        className="btn-primary mt-4 block w-full py-3 text-center"
      >
        تنزيل نسخة احتياطية الآن
      </a>

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-semibold text-accent">
          كيف أستعيدها لو احتجت؟
        </summary>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-muted">
          <p>
            الملفّ نصّي عادي فيه كل بياناتك، ويُستعاد بأمر واحد على قاعدة
            مُطبَّقة عليها الهجرات:
          </p>
          <pre className="overflow-x-auto rounded-lg bg-dark/5 p-2 text-left" dir="ltr">
{`psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \\
  -f khazaf-backup-....sql`}
          </pre>
          <p>
            الملفّ يُوقف مُشغّلات النظام أثناء الاستعادة ثم يُعيد تشغيلها — فتعود
            البيانات <strong>كما كانت بالضبط</strong>، لا كما يُعيد النظام
            حسابها. وهذا فرق مهمّ: نسخةٌ تعود «مشابهة» ليست نسخة.
          </p>
          <p>
            نزّلها كل أسبوع على الأقلّ، وبعد كل يوم مزدحم. الملفّ صغير — كيلوباتات
            لا ميغاباتات.
          </p>
        </div>
      </details>
    </section>
  );
}
