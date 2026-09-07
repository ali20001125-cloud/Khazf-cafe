-- =====================================================================
-- إنشاء محصول ومشروب جديدين ثم البيع منهما
--
-- يتحقّق أن المشروب المُنشأ من اللوحة **قابل للبيع فوراً وبلا نقص**:
-- له محاصيل بأسعار، وله وصفة تخصم المخزون، والكوب للسفري فقط.
-- مشروب بلا وصفة يُباع بلا أن ينقص شيء — فيبدو المخزون سليماً وهو ينزف.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar from users where role='barista' limit 1 \gset
select id as own from users where role='owner' limit 1 \gset
select id as milk from materials where name='حليب' limit 1 \gset

\echo '=== ١. محصول جديد (مادة في المخزون برصيد صفر) ==='
insert into materials (business_id, name, base_unit, low_threshold, current_cost, dose_grams)
values (:'biz', 'حبوب اختبار', 'g', 500, 0, 18) returning id as crop \gset
select name, base_unit, cached_stock, dose_grams from materials where id = :'crop';

\echo ''
\echo '=== ٢. لا يمكن البيع منه قبل شرائه (رصيد صفر) ==='
insert into products (business_id, name, category, sort)
values (:'biz', 'مشروب اختبار', 'other', 999) returning id as prod \gset
insert into product_crops (product_id, material_id, price, available)
values (:'prod', :'crop', 4000, true);
insert into recipes (product_id, version, coffee_grams, active)
values (:'prod', 1, 18, true) returning id as rec \gset
insert into recipe_items (recipe_id, material_id, qty, only_takeaway)
values (:'rec', :'milk', 150, false);
insert into recipe_items (recipe_id, material_id, qty, only_takeaway)
select :'rec', id, 1, true from materials
where business_id = :'biz' and name in ('كوب سفري','غطاء');

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

create or replace function must_fail(p_sql text, p_label text) returns text
language plpgsql as $$
begin execute p_sql; return '✗ FAIL: ' || p_label;
exception when others then return '✓ ' || p_label || ' → ' || left(sqlerrm, 45); end $$;

select must_fail(format($$select checkout(%L,%L,%L,%L,'takeaway','cash',10000,'np-0',
  jsonb_build_array(jsonb_build_object('product_id',%L,'crop_material_id',%L,'qty',1)),null,null)$$,
  :'biz',:'branch',:'bar',:'shift',:'prod',:'crop'), 'البيع برصيد صفر مرفوض');

\echo ''
\echo '=== ٣. شراء ١ كغ ثم البيع ==='
select record_purchase(:'biz',:'branch',:'own',:'crop',1000,25,'شراء أول') as stock_after_purchase;

select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',5000,'np-1',
  jsonb_build_array(jsonb_build_object('product_id',:'prod','crop_material_id',:'crop','qty',1)),
  null,null) ->> 'total' as sold_for \gset
\echo 'بيع سفري بسعر:' :sold_for

\echo 'ما نقص من المخزون:'
select m.name, t.qty_delta from inventory_transactions t
join materials m on m.id = t.material_id
where t.order_id = (select id from orders order by order_number desc limit 1)
order by m.name;

\echo ''
\echo '=== ٤. الجلوس لا يخصم الكوب والغطاء ==='
select checkout(:'biz',:'branch',:'bar',:'shift','dine_in','cash',5000,'np-2',
  jsonb_build_array(jsonb_build_object('product_id',:'prod','crop_material_id',:'crop','qty',1)),
  null,null) ->> 'order_number' as o2 \gset
select m.name, t.qty_delta from inventory_transactions t
join materials m on m.id = t.material_id
where t.order_id = (select id from orders where order_number = :o2)
order by m.name;

\echo ''
\echo '=== ٥. المحصول الجديد يظهر في نظرة المخزون بمشروبه ==='
select name, stock, is_crop, used_in, avg_per_day
from material_overview(:'biz', 30) where name = 'حبوب اختبار';

drop function must_fail(text, text);
