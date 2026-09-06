\pset pager off
\set QUIET on
select id as biz from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar from users where role='barista' limit 1 \gset
select id as own from users where role='owner' limit 1 \gset
select id as latte from products where name='لاتيه' limit 1 \gset
select id as crop from materials where name='حبوب الدورادو' limit 1 \gset
update materials set dose_grams = 18 where base_unit='g';
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

\echo '=== §30 مشروب موظف: مجاني · ينقص المخزون · لا يفتح الدرج ==='
select set_config('khazaf.reopen','on',false);
select staff_drink(:'biz',:'branch',:'bar',:'shift',:'latte',:'crop','takeaway',null) ->> 'order_number' as staff_order;
select order_number, order_type, total from orders where order_type='STAFF_DRINK';
select 'حركات كاش للمشروب: ' || count(*) from cash_movements where shift_id = :'shift';
select type, qty_delta from inventory_transactions where type='STAFF';

\echo ''
\echo '=== §29 الهدر بسبب · §36 الجرد والفرق ==='
select record_waste(:'biz',:'branch',:'bar',:'crop', 50, 'dial_in') as stock_after_waste;
select must_fail(format($$select record_waste(%L,%L,%L,%L,50,'')$$,:'biz',:'branch',:'bar',:'crop'), 'هدر بلا سبب مرفوض');

select cached_stock as before_count from materials where id = :'crop' \gset
select jsonb_pretty(apply_stock_count(:'biz',:'branch',:'own',
  jsonb_build_array(jsonb_build_object('material_id', :'crop', 'counted', :before_count - 18))));

\echo 'الرصيد = مجموع الدفتر بعد كل العمليات؟'
select m.name, m.cached_stock,
  (select coalesce(sum(qty_delta),0) from inventory_transactions t where t.material_id=m.id) as ledger,
  m.cached_stock = (select coalesce(sum(qty_delta),0) from inventory_transactions t where t.material_id=m.id) as match
from materials m where m.active order by m.name;

\echo ''
\echo '=== §34 الفرق ≈ كم جرعة (لا يُسمّى هدراً ولا سرقة) ==='
select material_name, expected, counted, variance, variance_pct, threshold_pct,
       equivalent_doses, level, label
from v_stock_variance;

\echo ''
\echo '=== §55 لوحة المخزون ==='
select material_name, opening, purchases, sales, loyalty, staff, waste, adjustments, expected, actual, variance
from inventory_dashboard(:'branch', (now() at time zone 'Asia/Baghdad')::date - 1, (now() at time zone 'Asia/Baghdad')::date)
where sales > 0 or waste > 0 or loyalty > 0;

\echo ''
\echo '=== §56 لوحة الاستثناءات ==='
select kind, severity, detail from v_exceptions order by severity, kind;

\echo ''
\echo '=== §8 تاريخ الأسعار ==='
select set_config('khazaf.actor', :'own', false), set_config('khazaf.reason','رفع سعر موسمي', false);
update product_crops set price = 3500 where product_id = :'latte' and material_id = :'crop';
select old_price, new_price, (changed_by = :'own') as by_owner, reason from price_history
where product_id = :'latte' and material_id = :'crop' order by created_at;
