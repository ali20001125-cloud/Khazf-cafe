-- =====================================================================
-- الإلغاء والإرجاع (المواصفة §49 · §50 · §56 · §58)
-- يتحقّق أن: الملغى يخرج من المبيعات · الإرجاع الجزئي ثم الكامل ينقل
-- حالة الطلب صحيحاً · الكاش ينقص · السقف مفروض · الاستثناءات تظهر.
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

\echo '=== ثلاث فواتير للاختبار ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'rv-1',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',2)),null,null)->>'order_number' as a \gset
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'rv-2',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),null,null)->>'order_number' as b \gset
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','card',null,'rv-3',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),null,null)->>'order_number' as c \gset
\echo 'الفواتير:' :a :b :c

select id as o1 from orders where order_number = :a \gset
select id as o2 from orders where order_number = :b \gset

\echo ''
\echo '=== §49 إلغاء بعد الدفع: الطلب يبقى، والبيع يخرج ==='
insert into order_voids (order_id, reason, voided_by, approved_by)
values (:'o1','مشروب سُكب بالخطأ',:'bar',:'own');
update orders set status='VOIDED' where id=:'o1';
select order_number, status from orders where id=:'o1';
select 'مبيعات الكاش الآن = ' || (day_summary(:'branch',(now() at time zone 'Asia/Baghdad')::date)->>'cash_sales')
       || '  (الفاتورة الملغاة 6000 خرجت)' as check_voided_excluded;

\echo ''
\echo '=== §50 إرجاع جزئي ثم استكمال ==='
insert into refunds (business_id,branch_id,order_id,shift_id,amount,method,reason,requested_by,approved_by,status,idempotency_key,completed_at)
values (:'biz',:'branch',:'o2',:'shift',1000,'cash','زبون غيّر رأيه',:'bar',:'own','COMPLETED','rf-a',now());
select order_number, status as after_partial from orders where id=:'o2';

insert into refunds (business_id,branch_id,order_id,shift_id,amount,method,reason,requested_by,approved_by,status,idempotency_key,completed_at)
values (:'biz',:'branch',:'o2',:'shift',2000,'cash','استكمال الإرجاع',:'bar',:'own','COMPLETED','rf-b',now());
select order_number, status as after_full from orders where id=:'o2';

\echo 'حركات الكاش (الإرجاع سالب):'
select type, amount, reason from cash_movements order by created_at;

\echo ''
\echo '=== §58 السقف مفروض ==='
select must_fail(format($$insert into refunds (business_id,branch_id,order_id,shift_id,amount,method,reason,requested_by,status,idempotency_key,completed_at)
  values (%L,%L,%L,%L,500,'cash','تجاوز',%L,'COMPLETED','rf-c',now())$$,:'biz',:'branch',:'o2',:'shift',:'bar'),
  'إرجاع يتجاوز المدفوع مرفوض');

select must_fail(format($$insert into refunds (business_id,branch_id,order_id,shift_id,amount,method,reason,requested_by,status,idempotency_key,completed_at)
  values (%L,%L,%L,%L,1000,'cash','تكرار',%L,'COMPLETED','rf-a',now())$$,:'biz',:'branch',:'o2',:'shift',:'bar'),
  'إرجاع بمفتاح مكرّر مرفوض');

\echo ''
\echo '=== §56 الاستثناءات ترصد الإلغاء والإرجاع ==='
select kind, severity from v_exceptions order by severity, kind;

drop function must_fail(text, text);
