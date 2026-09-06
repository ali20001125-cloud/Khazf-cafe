\pset pager off
\set QUIET on
select id as biz from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar from users where role='barista' limit 1 \gset
select id as own from users where role='owner' limit 1 \gset
select id as latte from products where name='لاتيه' limit 1 \gset
select id as crop from materials where name='حبوب الدورادو' limit 1 \gset
select id as shift from shifts where status='OPEN' limit 1 \gset

\echo '=== §28 فتح الدرج بلا بيع (حدث مسجَّل) ==='
insert into no_sale_opens (business_id, branch_id, shift_id, user_id, reason)
values (:'biz', :'branch', :'shift', :'bar', 'تبديل فكّة للزبون');
select user_id is not null as has_user, reason from no_sale_opens;

\echo ''
\echo '=== §25 سحب مبيعات الإغلاق (لا يُحسب إيراداً) ==='
select cash_removal(:'shift', :'own', 50000, 'تسليم للمالك') as r \gset
select (:'r'::jsonb)->>'amount' as removed, (:'r'::jsonb)->>'kept_float' as kept;
select 'المتوقّع بعد السحب = ' || shift_expected_cash(:'shift');

\echo ''
\echo '=== §27 تسليم الدرج ==='
insert into drawer_handovers (branch_id, shift_id, from_user_id, to_user_id, counted_cash, status)
values (:'branch', :'shift', :'bar', :'own', 50000, 'PENDING') returning id as ho \gset
update drawer_handovers set status='CONFIRMED', confirmed_at=now() where id=:'ho';
select 'مالك الدرج الآن هو المالك؟ ' || (drawer_owner_id = :'own')::text from shifts where id = :'shift';
select must_fail(format($$update drawer_handovers set status='CANCELLED' where id=%L$$, :'ho'), 'تعديل تسليم مُنجَز مرفوض');

\echo ''
\echo '=== §26 الإغلاق الأعمى ==='
select close_shift_blind(:'shift', :'bar', 49500) as c \gset
\echo 'ما يعود للباريستا (بلا أرقام مالية):' :c
select opening_float, counted_cash, expected_cash, variance, status from shifts where id = :'shift';

\echo ''
\echo '=== §53 إغلاق اليوم يمنع أي عملية جديدة ==='
insert into day_closes (branch_id, business_day, closed_by, totals)
values (:'branch', (now() at time zone 'Asia/Baghdad')::date, :'own', day_summary(:'branch', (now() at time zone 'Asia/Baghdad')::date));
select must_fail(format($$select checkout(%L,%L,%L,null,'takeaway','cash',10000,'after-close',
   jsonb_build_array(jsonb_build_object('product_id',%L,'crop_material_id',%L,'qty',1)))$$,
   :'biz',:'branch',:'bar',:'latte',:'crop'), 'بيع في يوم مُغلق مرفوض');

\echo 'وبعلم إعادة الفتح (المالك يملك day.reopen):'
select set_config('khazaf.reopen','on',false);
select (checkout(:'biz',:'branch',:'bar',null,'takeaway','cash',10000,'reopened-1',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1))) ->> 'order_number') as reopened_order;
select set_config('khazaf.reopen','off',false);

\echo ''
\echo '=== §54 لمحة اليوم للمالك ==='
select jsonb_pretty(day_summary(:'branch', (now() at time zone 'Asia/Baghdad')::date));
