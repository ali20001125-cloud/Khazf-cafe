\pset pager off
\set QUIET on
select id as biz from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar from users where role='barista' limit 1 \gset
select id as own from users where role='owner' limit 1 \gset
select id as latte from products where name='لاتيه' limit 1 \gset
select id as crop from materials where name='حبوب الدورادو' limit 1 \gset

insert into shifts (business_id, branch_id, employee_id, drawer_owner_id, opening_float, status)
values (:'biz', :'branch', :'bar', :'bar', 50000, 'OPEN') returning id as shift \gset

insert into customers (business_id, phone, name, phone_verified_at)
values (:'biz', '07701234567', 'زبون تجربة', now()) returning id as cust \gset
insert into loyalty_accounts (business_id, customer_id) values (:'biz', :'cust') returning id as acc \gset

\echo '=== §39 الكسب: ٣ فواتير × ٢ لاتيه ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'loy-1',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',2)), :'cust'::uuid, null) ->> 'order_number' as o1 \gset
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'loy-2',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',2)), :'cust'::uuid, null) ->> 'order_number' as o2 \gset
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'loy-3',
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',2)), :'cust'::uuid, null) ->> 'order_number' as o3 \gset
\echo 'أرقام الفواتير:' :o1 :o2 :o3

\echo 'دفتر الولاء (§46):'
select type, stamps_delta, reason from loyalty_ledger order by created_at;
select stamps, rewards_available from v_loyalty_accounts where account_id = :'acc';

\echo ''
\echo '=== §42 صرف المكافأة ==='
select id as rw from loyalty_rewards where status='AVAILABLE' limit 1 \gset
select redeem_reward(:'biz',:'branch',:'bar',:'shift',:'rw',:'latte',:'crop','takeaway','redeem-1') as r \gset
select (:'r'::jsonb)->>'order_number' as reward_order, (:'r'::jsonb)->>'total' as total;

select o.order_number, o.order_type, o.subtotal, o.discount, o.total, p.method, p.amount, p.status
from orders o join payments p on p.order_id=o.id where o.order_type='LOYALTY_REWARD';

\echo 'حركات كاش (يجب ٣ فقط: الفواتير المدفوعة — لا شيء للمكافأة §43):'
select type, amount, reason from cash_movements order by created_at;

\echo 'خصم المخزون بنوع LOYALTY_REWARD:'
select m.name, t.qty_delta from inventory_transactions t join materials m on m.id=t.material_id where t.type='LOYALTY_REWARD';

\echo ''
\echo '=== §45 لا تُصرف مرّتين ==='
select must_fail(format($$select redeem_reward(%L,%L,%L,%L,%L,%L,%L,'takeaway','redeem-2')$$,
  :'biz',:'branch',:'bar',:'shift',:'rw',:'latte',:'crop'), 'إعادة صرف نفس المكافأة مرفوضة');
select stamps, rewards_available from v_loyalty_accounts where account_id = :'acc';

\echo ''
\echo '=== §47 الإرجاع يعكس الكسب ==='
select id as ord1 from orders where order_number = :o1 \gset
insert into refunds (business_id, branch_id, order_id, shift_id, amount, method, reason, requested_by, approved_by, status, idempotency_key, completed_at)
values (:'biz', :'branch', :'ord1', :'shift', 6000, 'cash', 'مشروب غير مطابق', :'bar', :'own', 'COMPLETED', 'rf-1', now());
select order_number, status from orders where order_number = :o1;
select type, stamps_delta from loyalty_ledger where type='EARN_REVERSAL';
select stamps, rewards_available from v_loyalty_accounts where account_id = :'acc';
\echo 'حركة الكاش السالبة للإرجاع:'
select type, amount from cash_movements where type='REFUND';

\echo ''
\echo '=== §58 الإرجاع لا يتجاوز المدفوع ==='
select must_fail(format($$insert into refunds (business_id,branch_id,order_id,shift_id,amount,method,reason,requested_by,status,idempotency_key,completed_at)
  values (%L,%L,%L,%L,999999,'cash','تجاوز',%L,'COMPLETED','rf-2',now())$$, :'biz',:'branch',:'ord1',:'shift',:'bar'),
  'إرجاع أكبر من المدفوع مرفوض');
