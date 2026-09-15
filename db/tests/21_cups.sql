-- =====================================================================
-- الكوب يتبع حرارة المشروب — والسيراميك لا يُحسَب
--
-- ثلاث حقائق يجب أن تبقى صحيحة مهما تغيّر الكتالوج:
--   ١. السفري الساخن يخصم ورقاً، والسفري البارد يخصم بلاستك.
--   ٢. الجلوس لا يخصم كوباً أبداً — السيراميك يُغسل ويعود.
--   ٣. نفاد الورق لا يوقف بيع البارد، ولا العكس.
-- الثالثة هي سبب الفصل أصلاً: كوبٌ واحد باسمين يُخفي أيّهما نفد.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner' limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset
select id as hot    from products where name='أمريكانو' limit 1 \gset
select id as cold   from products where name='آيس أمريكانو' limit 1 \gset

-- رصيد افتتاحي عبر الدفتر: حبوب · حليب · أكواب الورق والبلاستك
insert into inventory_transactions (business_id,branch_id,material_id,type,qty_delta,unit_cost,reason,user_id)
select :'biz', :'branch', id, 'PURCHASE',
       case base_unit when 'g' then 5000 when 'ml' then 12000 else 100 end,
       case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,
       'رصيد افتتاحي', :'own'
from materials where business_id = :'biz' and active;

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

\echo '=== ١. سفري ساخن يخصم ورقاً فقط ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'cup-1',
  jsonb_build_array(jsonb_build_object('product_id',:'hot','crop_material_id',:'crop','qty',1)),
  null,null) ->> 'order_number' as o1 \gset
select m.name as "المادة", t.qty_delta as "التغيّر"
from inventory_transactions t join materials m on m.id=t.material_id
where t.order_id=(select id from orders where order_number=:o1) and m.base_unit='pcs'
order by m.name;
select case when count(*)=2 and bool_and(m.name like '%ورقي') then '✓ ورق فقط'
            else '❌ خصم كوباً خاطئاً' end as "النتيجة"
from inventory_transactions t join materials m on m.id=t.material_id
where t.order_id=(select id from orders where order_number=:o1) and m.base_unit='pcs';

\echo ''
\echo '=== ٢. سفري بارد يخصم بلاستك فقط ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'cup-2',
  jsonb_build_array(jsonb_build_object('product_id',:'cold','crop_material_id',:'crop','qty',1)),
  null,null) ->> 'order_number' as o2 \gset
select m.name as "المادة", t.qty_delta as "التغيّر"
from inventory_transactions t join materials m on m.id=t.material_id
where t.order_id=(select id from orders where order_number=:o2) and m.base_unit='pcs'
order by m.name;
select case when count(*)=2 and bool_and(m.name like '%بلاستك') then '✓ بلاستك فقط'
            else '❌ خصم كوباً خاطئاً' end as "النتيجة"
from inventory_transactions t join materials m on m.id=t.material_id
where t.order_id=(select id from orders where order_number=:o2) and m.base_unit='pcs';

\echo ''
\echo '=== ٣. الجلوس لا يخصم كوباً (سيراميك) ==='
select checkout(:'biz',:'branch',:'bar',:'shift','dine_in','cash',10000,'cup-3',
  jsonb_build_array(jsonb_build_object('product_id',:'cold','crop_material_id',:'crop','qty',1)),
  null,null) ->> 'order_number' as o3 \gset
select case when count(*)=0 then '✓ لا كوب للجلوس' else '❌ خصم كوباً للجلوس' end as "النتيجة"
from inventory_transactions t join materials m on m.id=t.material_id
where t.order_id=(select id from orders where order_number=:o3) and m.base_unit='pcs';

\echo ''
\echo '=== ٤. نفاد الورق لا يوقف البارد ==='
-- نُفرِغ الورق عبر الدفتر (لا كتابة مباشرة على الرصيد)
insert into inventory_transactions (business_id,branch_id,material_id,type,qty_delta,reason,user_id)
select :'biz',:'branch',id,'ADJUSTMENT',-cached_stock,'إفراغ للاختبار',:'own'
from materials where business_id=:'biz' and name like '%ورقي' and cached_stock > 0;

select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',10000,'cup-4',
  jsonb_build_array(jsonb_build_object('product_id',:'cold','crop_material_id',:'crop','qty',1)),
  null,null) ->> 'order_number' as o4 \gset
select case when :'o4' is not null and :'o4' <> ''
            then '✓ البارد ما زال يُباع' else '❌ الورق أوقف البارد' end as "النتيجة";

\echo ''
\echo '=== ٥. الرسالة تسمّي المادة التي أوقفت البيع ==='
select p.name as "المشروب", v.servings_takeaway as "يكفي لـ", v.blocker_takeaway as "الذي أوقفه"
from v_servings_left v join products p on p.id=v.product_id
where p.id = :'hot' and v.crop_material_id = :'crop';
select case when blocker_takeaway like '%ورقي' then '✓ سمّت الورق'
            else '❌ لم تسمِّ المادة الصحيحة: ' || coalesce(blocker_takeaway,'—') end as "النتيجة"
from v_servings_left where product_id = :'hot' and crop_material_id = :'crop';
