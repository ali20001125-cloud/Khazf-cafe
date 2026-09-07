#!/usr/bin/env bash
# تشغيل كل اختبارات القاعدة بالترتيب، مع تصفير بينها.
# التصفير ضروري: كل سكربت يفتح وردية، ولا يُسمح بأكثر من وردية مفتوحة للفرع.
#
#   PGHOST=/tmp/pg PGPORT=55432 PGUSER=postgres PGDATABASE=khazf_cafe \
#     db/tests/run-all.sh
#
# على قاعدة تجريبية فقط — تكتب طلبات وحركات حقيقية.
set -uo pipefail
cd "$(dirname "$0")/../.."

fail=0
for f in db/tests/[0-9]*.sql; do
  psql -q -v ON_ERROR_STOP=1 -f db/tests/_reset.sql >/dev/null || { echo "✗ تعذّر التصفير"; exit 1; }
  out=$(psql -v ON_ERROR_STOP=1 -f "$f" 2>&1)
  name=$(basename "$f")
  if [ $? -ne 0 ]; then
    echo "✗ $name — توقّف بخطأ"; echo "$out" | tail -6; fail=1
  elif echo "$out" | grep -q '❌'; then
    echo "✗ $name — تأكيد فاشل"; echo "$out" | grep '❌'; fail=1
  else
    echo "✓ $name"
  fi
done

psql -q -f db/tests/_reset.sql >/dev/null
[ $fail -eq 0 ] && echo "— كل الاختبارات نجحت" || echo "— هناك فشل"
exit $fail
