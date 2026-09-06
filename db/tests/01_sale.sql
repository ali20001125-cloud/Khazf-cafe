\set ON_ERROR_STOP on
\set QUIET on
\pset pager off
select set_config('khazaf.biz',   (select id::text from businesses limit 1), false),
       set_config('khazaf.branch',(select id::text from branches   limit 1), false),
       set_config('khazaf.owner', (select id::text from users where role='owner' limit 1), false),
       set_config('khazaf.bar',   (select id::text from users where role='barista' limit 1), false),
       set_config('khazaf.latte', (select id::text from products where name='لاتيه' limit 1), false),
       set_config('khazaf.crop',  (select id::text from materials where name='حبوب الدورادو' limit 1), false),
       set_config('khazaf.milk',  (select id::text from materials where name='حليب' limit 1), false)
\gset _
\echo '--- T1: فتح وردية + بيع واحد ---'
insert into shifts (business_id, branch_id, employee_id, drawer_owner_id, opening_float, status)
values (current_setting('khazaf.biz')::uuid, current_setting('khazaf.branch')::uuid,
        current_setting('khazaf.bar')::uuid, current_setting('khazaf.bar')::uuid, 50000, 'OPEN')
returning id \gset shift_
select set_config('khazaf.shift', :'shift_id', false);

select checkout(
  current_setting('khazaf.biz')::uuid, current_setting('khazaf.branch')::uuid,
  current_setting('khazaf.bar')::uuid, current_setting('khazaf.shift')::uuid,
  'takeaway','cash', 10000, 'test-sale-1',
  jsonb_build_array(jsonb_build_object('product_id', current_setting('khazaf.latte'),
                                       'crop_material_id', current_setting('khazaf.crop'), 'qty', 2))
) as sale \gset

\echo 'نتيجة البيع:'
select :'sale'::jsonb ->> 'order_number' as order_no, :'sale'::jsonb ->> 'total' as total,
       :'sale'::jsonb ->> 'change' as change;

\echo 'خصم مرّة واحدة؟ (الرصيد يطابق الدفتر لكل مادة)'
select m.name, m.cached_stock,
       (select coalesce(sum(qty_delta),0) from inventory_transactions t where t.material_id = m.id) as ledger_sum,
       m.cached_stock = (select coalesce(sum(qty_delta),0) from inventory_transactions t where t.material_id = m.id) as match
from materials m where m.id in (current_setting('khazaf.crop')::uuid, current_setting('khazaf.milk')::uuid);

\echo 'نوع الطلب:'
select order_number, order_type, status, total from orders order by order_number;

\echo '--- T2: إعادة إرسال بنفس المفتاح (§60) ---'
select (checkout(
  current_setting('khazaf.biz')::uuid, current_setting('khazaf.branch')::uuid,
  current_setting('khazaf.bar')::uuid, current_setting('khazaf.shift')::uuid,
  'takeaway','cash', 10000, 'test-sale-1',
  jsonb_build_array(jsonb_build_object('product_id', current_setting('khazaf.latte'),
                                       'crop_material_id', current_setting('khazaf.crop'), 'qty', 2))
) ->> 'replay')::boolean as is_replay,
(select count(*) from orders) as orders_total,
(select cached_stock from materials where id = current_setting('khazaf.crop')::uuid) as crop_stock_unchanged;
