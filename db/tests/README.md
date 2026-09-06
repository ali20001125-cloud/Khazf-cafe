# اختبارات القاعدة — خزف كافيه

سكربتات `psql` تتحقّق من ضمانات المواصفة التقنية (`docs/KHAZAF-POS-TECHSPEC.md` §19)
مباشرةً على قاعدة البيانات: الذرّية، منع التكرار، عدم قابلية الدفاتر للتعديل،
آلات الحالة، الولاء، الكاش، والفروقات.

## التشغيل

على **قاعدة تجريبية فقط** — لا تشغّلها على الإنتاج: تكتب طلبات وحركات حقيقية.

```bash
# ١) قاعدة محلّية (الأسرع، ولا تحتاج شبكة)
initdb -D /tmp/pg/data -U postgres --auth=trust
pg_ctl -D /tmp/pg/data -o "-k /tmp/pg -p 55432" start
createdb -h /tmp/pg -p 55432 -U postgres khazf_cafe

export PGHOST=/tmp/pg PGPORT=55432 PGUSER=postgres PGDATABASE=khazf_cafe
for f in db/migrations/0001*.sql db/migrations/000[2-8]*.sql db/seed.sql db/seed-modifiers.sql; do
  psql -v ON_ERROR_STOP=1 -f "$f"
done
for f in db/migrations/00{09,10,11,12,13,14,15,16}_*.sql; do
  psql -v ON_ERROR_STOP=1 -f "$f"
done

# ٢) شغّل الاختبارات بالترتيب
psql -f db/tests/01_sale.sql        # البيع · الذرّية · منع التكرار
psql -f db/tests/02_integrity.sql   # ما يجب أن ترفضه القاعدة
psql -f db/tests/03_loyalty.sql     # الكسب · المكافأة · الصرف · عكس الإرجاع
psql -f db/tests/04_cash.sql        # الدرج · العدّ الأعمى · إغلاق اليوم
psql -f db/tests/05_inventory.sql   # مشروب موظف · هدر · جرد · الفروقات · الأسعار
```

بدل القاعدة المحلّية يمكن استخدام **فرع Neon مؤقّت** (نسخة من الإنتاج) ثم حذفه.

## القراءة

`02_integrity.sql` يعرّف `must_fail(sql, label)`: تنجح الحالة حين **تفشل** الجملة.
- `✓` = رُفضت كما يجب.
- `✗ FAIL` = نجحت وكان يجب أن تُرفض ← ثغرة.

> **تنبيه:** مُشغّلات `BEFORE UPDATE/DELETE` لا تعمل على جدول فارغ. تأكّد أن
> الجدول فيه صفّ واحد على الأقلّ قبل اختبار «عدم القابلية للتعديل»، وإلا ظهر
> النجاح الكاذب.

النتائج المثبتة (٤٦ حالة) في `docs/KHAZAF-POS-TECHSPEC.md` §19.
