import "server-only";
import { db } from "./db";

/**
 * النسخة الاحتياطية (§64).
 *
 * لماذا هذا موجود: نافذة الاسترجاع الزمني على Neon (الخطة الحالية) **٦
 * ساعات**. يعني لو حدث خطأ ليلاً ولاحظه المالك صباحاً، فالوقت قد فات. ونسخةٌ
 * لا تُخزَّن خارج القاعدة ليست نسخةً احتياطية — هي نفس القاعدة.
 *
 * فالمُخرَج ملفّ `.sql` واحد يُنزَّل ويُحفظ حيث يشاء المالك، ويُستعاد بأمر
 * واحد. وفيه ثلاثة قرارات مقصودة:
 *
 * ١. `session_replication_role = replica` في أوّله — يُوقف مُشغّلات
 *    المستخدم أثناء الاستعادة. بدونه يُعيد مُشغّل الدفتر حساب `cached_stock`
 *    ويُعيد ختم التكاليف الفارغة، فتعود القاعدة **مشابهةً** لا **مطابقة**.
 *    والنسخة التي تعود مشابهةً ليست نسخة.
 * ٢. الترتيب لا يهمّ لنفس السبب: المفاتيح الأجنبية معطّلة أثناء الاستعادة،
 *    فلا نحتاج ترتيب الجداول ترتيباً هرمياً هشّاً.
 * ٣. `delete from` قبل الإدراج لكل جدول — لتكون الاستعادة **حتمية**: نفس
 *    الملفّ يعطي نفس النتيجة مهما كانت القاعدة قبله.
 */

/** تهريب اسم جدول ليصير مُعرِّفاً صحيحاً في SQL. */
function qident(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** الجداول التي تُنسخ: كل ما في المخطّط العامّ، بلا `view`. */
async function tables(): Promise<string[]> {
  const rows = (await db()`
    select table_name from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `) as { table_name: string }[];
  return rows.map((r) => r.table_name);
}

/**
 * أعمدة JSON لكل جدول — تُقرأ من المخطّط لا تُستنتج من القيمة.
 *
 * السبب خللٌ حقيقي كشفته أول استعادة: `settings.value` من نوع `jsonb`
 * ويحمل النصّ `"IQD"`. السوّاق يُعيده قيمةَ جافاسكربت نصّية `IQD` — لا
 * يُفرَّق عن عمود `text` — فكُتب في الملفّ `'IQD'`، وهو ليس JSON صالحاً
 * فرفضته الاستعادة. نوع العمود لا يُستنتج من قيمته أبداً؛ يُقرأ من مصدره.
 */
async function jsonColumns(): Promise<Map<string, Set<string>>> {
  const rows = (await db()`
    select table_name, column_name from information_schema.columns
    where table_schema = 'public' and data_type in ('json', 'jsonb')
  `) as { table_name: string; column_name: string }[];
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = m.get(r.table_name) ?? new Set<string>();
    set.add(r.column_name);
    m.set(r.table_name, set);
  }
  return m;
}

/** حرفيّة SQL آمنة لأي قيمة قادمة من القاعدة. */
function lit(v: unknown, isJson = false): string {
  if (v === null || v === undefined) return "null";
  if (isJson) return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export type BackupMeta = { tables: number; rows: number; bytes: number };

/**
 * يبني ملفّ الاستعادة كاملاً في الذاكرة. مقبولٌ لحجم مقهى (عشرات آلاف
 * الصفوف)؛ ولو كبر يوماً فالمخرج يُقسَّم على دفعات.
 */
export async function buildBackupSql(): Promise<{ sql: string; meta: BackupMeta }> {
  const [names, jsonCols] = await Promise.all([tables(), jsonColumns()]);
  const now = new Date().toISOString();
  const out: string[] = [
    "-- نسخة احتياطية كاملة — خزف كافيه",
    `-- التاريخ: ${now}`,
    "--",
    "-- للاستعادة (على قاعدة فيها المخطّط والهجرات مُطبَّقة أصلاً):",
    "--   psql \"$DATABASE_URL\" -v ON_ERROR_STOP=1 -f khazaf-backup.sql",
    "--",
    "-- المُشغّلات مُوقَفة أثناء الاستعادة عن قصد: لتعود البيانات كما هي",
    "-- بالضبط، لا كما يُعيد النظام حسابها. ثم تُشغَّل من جديد في آخر الملفّ.",
    "begin;",
    "set session_replication_role = replica;",
    "",
  ];

  let rowCount = 0;
  for (const t of names) {
    // اسم الجدول يأتي من `information_schema` لا من مُدخَل مستخدم، ومع ذلك
    // يُهرَّب: قاعدةٌ واحدة للتهريب أسلم من استثناءٍ يُنسى.
    const sql = db();
    const ident = sql.unsafe(qident(t));
    const rows = (await sql`select * from ${ident}`) as Record<string, unknown>[];
    out.push(`-- ${t} (${rows.length})`);
    out.push(`delete from ${qident(t)};`);
    if (rows.length > 0) {
      const cols = Object.keys(rows[0]);
      const colList = cols.map(qident).join(", ");
      const jsonSet = jsonCols.get(t) ?? new Set<string>();
      for (const r of rows) {
        out.push(
          `insert into ${qident(t)} (${colList}) values (${cols
            .map((c) => lit(r[c], jsonSet.has(c)))
            .join(", ")});`
        );
      }
      rowCount += rows.length;
    }
    out.push("");
  }

  out.push("set session_replication_role = origin;");
  out.push("commit;");
  out.push("");
  out.push(`-- المجموع: ${names.length} جدولاً · ${rowCount} صفّاً`);

  const sql = out.join("\n");
  return {
    sql,
    meta: { tables: names.length, rows: rowCount, bytes: Buffer.byteLength(sql, "utf8") },
  };
}

/**
 * أرقام تُعرض في الشاشة قبل التنزيل. **تقديرية** من إحصاءات Postgres في
 * استعلام واحد، لا بعدّ كل جدول: العدّ الدقيق هنا يكلّف زيارةً لكل جدول
 * في كل مرّة تُفتح الشاشة، والرقم الدقيق يُكتب في الملفّ نفسه.
 */
export async function backupSize(): Promise<{ tables: number; rows: number }> {
  const r = (await db()`
    select count(*)::int as tables,
           coalesce(sum(greatest(n_live_tup, 0)), 0)::int as rows
    from pg_stat_user_tables
  `) as { tables: number; rows: number }[];
  return r[0] ?? { tables: 0, rows: 0 };
}

/** آخر مرّة نُزّلت نسخة — من سجلّ التدقيق، فهو الأثر الوحيد الذي لا يُزوَّر. */
export async function lastBackupAt(businessId: string): Promise<string | null> {
  const r = (await db()`
    select created_at from audit_log
    where business_id = ${businessId} and action = 'backup_downloaded'
    order by created_at desc limit 1
  `) as { created_at: string }[];
  return r[0]?.created_at ?? null;
}
