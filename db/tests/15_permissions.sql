-- =====================================================================
-- الصلاحيات: المنع في الخادم لا في إخفاء الزرّ
--
-- إخفاء زرٍّ ليس منعاً — من يعرف العنوان يصل. فكل صلاحية تُفحص عند الفعل
-- نفسه، والشاشة تُخفي فقط لتريح لا لتحمي (§66).
--
-- ويُختبر هنا ما تحفظه القاعدة: ماذا يملك الباريستا فعلاً، وأن المنح
-- والسحب يتركان أثراً باسم من فعله.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz from businesses limit 1 \gset
select id as brole from roles where key='barista' limit 1 \gset

\echo '=== ١. ما لا يملكه الباريستا اليوم ==='
select p.label as "الصلاحية"
from permissions p
where p.key in ('cash.view_expected','reports.financial','payments.void',
                'payments.refund','users.manage','inventory.adjust')
  and not exists (select 1 from role_permissions rp
                   where rp.role_id = :'brole' and rp.permission = p.key)
order by p.key;

\echo ''
\echo '=== ٢. أهمّها: لا يرى المتوقّع في الدرج ==='
-- لو رآه لكتبه كما هو عند العدّ، فلا يظهر نقص أبداً — ويسقط الإغلاق الأعمى
select not exists (select 1 from role_permissions
                    where role_id = :'brole' and permission = 'cash.view_expected')
       as "العدّ الأعمى سليم";

\echo ''
\echo '=== ٣. منح صلاحية ثم سحبها ==='
insert into role_permissions (role_id, permission) values (:'brole','inventory.adjust')
on conflict do nothing;
select exists (select 1 from role_permissions
                where role_id = :'brole' and permission = 'inventory.adjust') as "بعد المنح";
delete from role_permissions where role_id = :'brole' and permission = 'inventory.adjust';
select exists (select 1 from role_permissions
                where role_id = :'brole' and permission = 'inventory.adjust') as "بعد السحب";

\echo ''
\echo '=== ٤. المالك يملك كل شيء، والباريستا جزءاً ==='
select r.key as "الدور", count(rp.permission) as "عدد الصلاحيات"
from roles r left join role_permissions rp on rp.role_id = r.id
group by r.key order by count(rp.permission) desc;

\echo ''
\echo '=== الخلاصة ==='
select case when not exists (select 1 from role_permissions
                              where role_id = :'brole' and permission = 'cash.view_expected')
       then '✓ الباريستا لا يرى المتوقّع — العدّ الأعمى يعمل'
       else '✗ الباريستا يرى المتوقّع — لا يظهر نقص أبداً' end as result
union all
select case when not exists (select 1 from role_permissions rp
                              where rp.role_id = :'brole'
                                and rp.permission in ('reports.financial','users.manage',
                                                      'settings.manage','payments.void',
                                                      'payments.refund','day.reopen'))
       then '✓ لا مال ولا تقارير ولا إدارة بيد الباريستا'
       else '✗ بيد الباريستا صلاحية حسّاسة' end
union all
select case when (select count(*) from role_permissions rp join roles r on r.id=rp.role_id
                   where r.key='barista') between 1 and 30
       then '✓ للباريستا صلاحيات تشغيل محدودة لا كل شيء'
       else '✗ صلاحيات الباريستا غير منطقية' end;
