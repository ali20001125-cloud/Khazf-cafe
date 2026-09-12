#!/usr/bin/env bash
# =====================================================================
# النسخة الاحتياطية: هل تُستعاد فعلاً؟
#
# نسخةٌ لم تُجرَّب استعادتها ليست نسخة — هي أملٌ في ملفّ. فهذا السكربت
# يأخذ نسخةً بالمُولّد **الحقيقي** (`src/lib/backup.ts`، لا نسخةً منه
# مكتوبةً للاختبار)، ثم يستعيدها على قاعدة **فارغة تماماً** فيها المخطّط
# وحده، ويقارن الأصل بالمُستعاد صفّاً صفّاً.
#
# ويثبت أيضاً أن `session_replication_role = replica` في رأس الملفّ ليس
# زينة: بدونه لا تكتمل الاستعادة أصلاً.
#
#   PGHOST=/tmp/pg PGPORT=55432 PGUSER=postgres db/tests/backup-roundtrip.sh
#
# يحتاج node و esbuild (موجودان في `node_modules`) وصلاحية `createdb`.
# =====================================================================
set -uo pipefail
cd "$(dirname "$0")/../.."

SRC="${PGDATABASE:-khazf_cafe}"
DST="khazf_restore_check"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"; dropdb --if-exists "$DST" 2>/dev/null' EXIT

# ── ١) وسيط يُشغّل المُولّد الحقيقي على Postgres محلّي ────────────────
# السوّاق في الإنتاج هو @neondatabase/serverless عبر HTTPS، ولا يتحدّث إلى
# مقبس محلّي. فنُبدّله بوسيط يُقلّد واجهته وينفّذ بـ psql — ويبقى المُولّد
# المُختبَر هو نفسه الذي يعمل في الإنتاج.
cat > "$WORK/shim.mjs" <<'JS'
import { execFileSync } from "node:child_process";
function run(text) {
  const out = execFileSync("psql", ["-At", "-v", "ON_ERROR_STOP=1", "-c",
    `select coalesce(json_agg(t), '[]'::json)::text from (${text}) t`],
    { env: process.env, maxBuffer: 1 << 28 }).toString();
  return JSON.parse(out.trim() || "[]");
}
export function neon() {
  const fn = (strings, ...vals) => {
    let text = "";
    strings.forEach((s, i) => {
      text += s;
      if (i < vals.length) {
        const v = vals[i];
        if (v && typeof v === "object" && "__raw" in v) text += v.__raw;
        else if (v === null || v === undefined) text += "null";
        else if (typeof v === "number" || typeof v === "boolean") text += String(v);
        else text += `'${String(v).replace(/'/g, "''")}'`;
      }
    });
    return Promise.resolve(run(text));
  };
  fn.unsafe = (s) => ({ __raw: s });
  return fn;
}
JS
echo 'export {};' > "$WORK/server-only.mjs"
cat > "$WORK/run.mjs" <<'JS'
import { buildBackupSql } from "./backup.js";
const { sql, meta } = await buildBackupSql();
process.stderr.write(JSON.stringify(meta) + "\n");
process.stdout.write(sql);
JS

node_modules/.bin/esbuild src/lib/backup.ts --bundle --platform=node --format=esm \
  --outfile="$WORK/backup.js" \
  --alias:@neondatabase/serverless="$WORK/shim.mjs" \
  --alias:server-only="$WORK/server-only.mjs" >/dev/null 2>&1 \
  || { echo "✗ تعذّرت ترجمة المُولّد"; exit 1; }

# ── ٢) بصمة الأصل ────────────────────────────────────────────────────
cat > "$WORK/fp.sql" <<'SQL'
select t.table_name || '=' ||
       (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', t.table_name), false, true, '')))[1]::text
from information_schema.tables t
where t.table_schema='public' and t.table_type='BASE TABLE' order by t.table_name;
SQL
snap() { # snap <db> <suffix>
  PGDATABASE="$1" psql -At -f "$WORK/fp.sql"                                             > "$WORK/fp.$2"
  PGDATABASE="$1" psql -At -c "select id||'|'||order_number||'|'||total||'|'||status from orders order by order_number" > "$WORK/orders.$2"
  PGDATABASE="$1" psql -At -c "select name||'|'||cached_stock||'|'||current_cost from materials order by name"          > "$WORK/mat.$2"
  PGDATABASE="$1" psql -At -c "select key||'='||value::text from settings order by key"  > "$WORK/set.$2"
  PGDATABASE="$1" psql -At -c "select coalesce(sum(qty_delta),0)||'|'||coalesce(sum(coalesce(unit_cost,0)),0) from inventory_transactions" > "$WORK/led.$2"
}
snap "$SRC" before
echo "الأصل: $(wc -l < "$WORK/fp.before") جدولاً · $(wc -l < "$WORK/orders.before") طلباً"

# ── ٣) أخذ النسخة ────────────────────────────────────────────────────
PGDATABASE="$SRC" DATABASE_URL=local node "$WORK/run.mjs" > "$WORK/dump.sql" 2> "$WORK/meta.txt" \
  || { echo "✗ تعذّر بناء النسخة"; exit 1; }
echo "النسخة: $(cat "$WORK/meta.txt")"

# ── ٤) قاعدة فارغة: المخطّط والهجرات وحدها، بلا أي بيانات ───────────
dropdb --if-exists "$DST" 2>/dev/null; createdb "$DST"
export PGDATABASE="$DST"
{ for f in db/migrations/0001*.sql db/migrations/000[2-8]*.sql; do psql -q -v ON_ERROR_STOP=1 -f "$f" || echo "FAIL $f"; done
  psql -q -f db/migrations/0010_enums.sql
  for f in db/migrations/00{09,11,12,13,14,15,16,17,18,19,20,21,22,23,24}_*.sql; do psql -q -v ON_ERROR_STOP=1 -f "$f" || echo "FAIL $f"; done
} 2>&1 | grep -E "^FAIL" && { echo "✗ تعذّر بناء المخطّط"; exit 1; }
[ "$(psql -At -c 'select count(*) from materials')" = "0" ] \
  || { echo "✗ القاعدة الهدف ليست فارغة"; exit 1; }

# ── ٥) الاستعادة والمقارنة ───────────────────────────────────────────
if ! psql -q -v ON_ERROR_STOP=1 -f "$WORK/dump.sql" 2>"$WORK/err.txt"; then
  echo "✗ الاستعادة فشلت:"; head -3 "$WORK/err.txt"; exit 1
fi
snap "$DST" after

fail=0
for pair in "fp:صفوف كل الجداول" "orders:الطلبات" "mat:المخزون (رصيداً وتكلفة)" \
            "set:الإعدادات (jsonb)" "led:دفتر المخزون"; do
  k="${pair%%:*}"; label="${pair#*:}"
  if diff -q "$WORK/$k.before" "$WORK/$k.after" >/dev/null; then
    echo "✓ $label مطابق"
  else
    echo "✗ $label مختلف:"; diff "$WORK/$k.before" "$WORK/$k.after" | head -6; fail=1
  fi
done

# ── ٦) إيقاف المُشغّلات ليس زينة ──────────────────────────────────────
# بدونه يُدرَج `audit_log` قبل `businesses` فيسقط على مفتاح أجنبي، ولو
# نجح لأعاد مُشغّل الدفتر حساب `cached_stock` فوق المستعاد فتضاعف.
sed 's/^set session_replication_role = replica;$/-- (المُشغّلات تعمل)/' "$WORK/dump.sql" > "$WORK/on.sql"
dropdb --if-exists "${DST}_2" 2>/dev/null; createdb "${DST}_2"
PGDATABASE="${DST}_2" bash -c '
  for f in db/migrations/0001*.sql db/migrations/000[2-8]*.sql; do psql -q -v ON_ERROR_STOP=1 -f "$f"; done
  psql -q -f db/migrations/0010_enums.sql
  for f in db/migrations/00{09,11,12,13,14,15,16,17,18,19,20,21,22,23,24}_*.sql; do psql -q -v ON_ERROR_STOP=1 -f "$f"; done' >/dev/null 2>&1
if PGDATABASE="${DST}_2" psql -q -v ON_ERROR_STOP=1 -f "$WORK/on.sql" >/dev/null 2>&1; then
  echo "✗ الاستعادة نجحت بمُشغّلات عاملة — راجع الحاجة إلى إيقافها"
  fail=1
else
  echo "✓ بلا إيقاف المُشغّلات لا تكتمل الاستعادة — فالسطر ضروري لا زينة"
fi
dropdb --if-exists "${DST}_2" 2>/dev/null

[ $fail -eq 0 ] && echo "— النسخة تُستعاد مطابقةً للأصل" || echo "— النسخة لا تُستعاد مطابقة"
exit $fail
