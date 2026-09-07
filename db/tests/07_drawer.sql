-- =====================================================================
-- الدرج: فتح بلا بيع · تسليم · الإغلاق الأعمى · سحب المبيعات
-- المواصفة §23 · §25 · §26 · §27 · §28
-- =====================================================================
\pset pager off
\set QUIET on

create or replace function must_fail(p_sql text, p_label text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return '✗ FAIL — نجحت وكان يجب أن تُرفض: ' || p_label;
exception when others then
  return '✓ ' || p_label || '  →  ' || left(sqlerrm, 55);
end $$;

select id as biz from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar from users where role='barista' limit 1 \gset
select id as own from users where role='owner' limit 1 \gset
select id as latte from products where name='لاتيه' limit 1 \gset
select id as crop from materials where name='حبوب الدورادو' limit 1 \gset

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

\echo '=== §23 المتوقّع = الفكّة + الحركات (الفكّة ليست إيراداً) ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'dr-1',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',2)),null,null)->>'total' as t1 \gset
select 'بيع نقدي 6000 · المتوقّع = ' || shift_expected_cash(:'shift') || ' (50000 + 6000)';

\echo ''
\echo '=== §28 فتح الدرج بلا بيع ==='
insert into no_sale_opens (business_id, branch_id, shift_id, user_id, reason)
values (:'biz',:'branch',:'shift',:'own','تبديل فكّة للزبون');
select user_id is not null as has_user, reason, 'لا يغيّر المتوقّع: ' || shift_expected_cash(:'shift') as effect
from no_sale_opens order by created_at desc limit 1;

\echo ''
\echo '=== §27 تسليم الدرج: المسؤولية لا تنتقل قبل التأكيد ==='
insert into drawer_handovers (branch_id, shift_id, from_user_id, to_user_id, counted_cash,
                              expected_cash, variance)
values (:'branch',:'shift',:'bar',:'own',55500,
        shift_expected_cash(:'shift'), 55500 - shift_expected_cash(:'shift'))
returning id as ho \gset

select 'قبل التأكيد — مالك الدرج هو الباريستا؟ ' ||
       (drawer_owner_id = :'bar')::text as before_confirm from shifts where id = :'shift';

select must_fail(format($$insert into drawer_handovers (branch_id,shift_id,from_user_id,to_user_id,counted_cash)
  values (%L,%L,%L,%L,1000)$$, :'branch',:'shift',:'own',:'bar'),
  'تسليم معلّق ثانٍ لنفس الوردية مرفوض');

update drawer_handovers set status='CONFIRMED', confirmed_at=now() where id=:'ho';
select 'بعد التأكيد — مالك الدرج هو المالك؟ ' ||
       (drawer_owner_id = :'own')::text as after_confirm from shifts where id = :'shift';

select counted_cash, expected_cash, variance, status from drawer_handovers where id=:'ho';

select must_fail(format($$update drawer_handovers set status='PENDING' where id=%L$$, :'ho'),
  'إعادة فتح تسليم مُنجَز مرفوضة');

\echo ''
\echo '=== §25 سحب المبيعات: ليس إيراداً، والفكّة تبقى ==='
select cash_removal(:'shift', :'own', 50000, 'تسليم للمالك') as r \gset
select (:'r'::jsonb)->>'amount' as removed, (:'r'::jsonb)->>'kept_float' as kept,
       shift_expected_cash(:'shift') as expected_after;

\echo ''
\echo '=== §26 الإغلاق الأعمى: لا يُعيد رقماً مالياً ==='
select close_shift_blind(:'shift', :'bar', 49500) as returned_to_barista;
select opening_float, counted_cash, expected_cash, variance, status
from shifts where id = :'shift';

\echo 'وسطر التدقيق يحمل الأرقام للمالك:'
select action, after->>'expected' as expected, after->>'variance' as variance
from audit_log where action = 'close_shift' order by created_at desc limit 1;

drop function must_fail(text, text);
