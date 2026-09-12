-- =====================================================================
-- الرموز: هويّة لا كلمة مرور
--
-- الخلل الذي أنشأ هذا الاختبار: القاعدة الحيّة بقيت على رمز المالك 1111
-- ورمز الباريستا 0000 لأن شاشة التغيير لم تكن موجودة أصلاً. وخطورته أن
-- رمز المالك هو نفسه **رمز الموافقة** على إلغاء فاتورة مدفوعة وعلى إرجاع
-- المال — فمن يجرّب 1111 يفتح باب الصندوق.
--
-- ما يُختبر هنا هو ما تفرضه القاعدة. والمنطق الذي يعيش في طبقة التطبيق
-- (منع الرموز المكشوفة · منع تشابه رمزين · طلب رمز المالك) يُفحص في
-- `src/app/manage/users-actions.ts` لأن القاعدة لا تخزّن إلا التهشير،
-- وتمريرُ الرمز الصريح إليها يكتبه في سجلاتها.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz from businesses limit 1 \gset
select id as own from users where role='owner'   limit 1 \gset
select id as bar from users where role='barista' limit 1 \gset

-- يُعاد الباريستا لحالة التنصيب ليكون الاختبار قابلاً للتكرار
update users set pin_hash = crypt('0000', gen_salt('bf')), pin_changed_at = null,
                 active = true, failed_pin_attempts = 0, locked_until = null
 where id = :'bar';

\echo '=== ١. العمود موجود، وفارغٌ يعني «لم يُغيَّر بعد» ==='
select name, role,
       case when pin_changed_at is null then 'افتراضي — يجب تغييره'
            else 'غُيّر' end as "حالة الرمز"
from users where id in (:'own', :'bar') order by role;

\echo ''
\echo '=== ٢. التهشير لا يُقرأ: لا يُستخرج الرمز من القاعدة ==='
-- bcrypt اتجاه واحد. الإثبات: نفس الرمز يعطي تهشيرين مختلفين (ملح مختلف)،
-- فلا جدول أقواس عكسي ولا مقارنة نصّية.
select crypt('4729', gen_salt('bf')) <> crypt('4729', gen_salt('bf')) as "تهشيران مختلفان لنفس الرمز";

\echo ''
\echo '=== ٣. التحقّق يعمل بالمقارنة لا بالقراءة ==='
select u.pin_hash = crypt('1111', u.pin_hash) as "1111 يطابق رمز المالك؟"
from users u where u.id = :'own';

\echo ''
\echo '=== ٤. تغيير الرمز يُسجّل وقته ==='
create temp table _before as select pin_changed_at from users where id = :'bar';
update users set pin_hash = crypt('4729', gen_salt('bf')), pin_changed_at = now()
 where id = :'bar';
select (select pin_changed_at is null from _before) as "كان افتراضياً",
       (select pin_changed_at is not null from users where id = :'bar') as "صار مُغيَّراً",
       (select pin_hash = crypt('4729', pin_hash) from users where id = :'bar') as "الرمز الجديد يعمل",
       (select pin_hash = crypt('0000', pin_hash) from users where id = :'bar') as "الرمز القديم لم يعد يعمل";

\echo ''
\echo '=== ٥. الموظف لا يُحذف — يُعطَّل، فاسمه معلّق على فواتير ==='
-- التعطيل يُخرجه من شاشة الدخول ويُبقي تاريخه
update users set active = false where id = :'bar';
select (select count(*)::int from users where active and role='barista') as "باريستا نشط",
       (select count(*)::int from users where role='barista') as "باريستا موجود (بالتاريخ)";
update users set active = true where id = :'bar';

\echo ''
\echo '=== ٦. قفل بعد المحاولات الخاطئة يُفكّ بتصفير العدّاد ==='
update users set failed_pin_attempts = 5, locked_until = now() + interval '5 min'
 where id = :'bar';
select (select locked_until > now() from users where id = :'bar') as "مقفل الآن";
update users set failed_pin_attempts = 0, locked_until = null where id = :'bar';
select (select locked_until is null from users where id = :'bar') as "فُكّ القفل";

\echo ''
\echo '=== الخلاصة ==='
select case
  when (select count(*)::int from information_schema.columns
         where table_name='users' and column_name='pin_changed_at') = 1
   and (select pin_hash = crypt('4729', pin_hash) from users where id = :'bar')
   and (select pin_changed_at is not null from users where id = :'bar')
  then '✓ الرمز يُغيَّر، ووقت التغيير محفوظ، والقديم يبطل'
  else '✗ الرمز لا يُغيَّر كما يجب'
end as result
union all
select case
  when (select count(*)::int from users where role='barista') >= 1
  then '✓ التعطيل يُبقي التاريخ — لا حذف'
  else '✗ فُقد المستخدم'
end
union all
select case
  when (select locked_until is null and failed_pin_attempts = 0
          from users where id = :'bar')
  then '✓ القفل يُفكّ'
  else '✗ القفل لا يُفكّ'
end;
drop table _before;
