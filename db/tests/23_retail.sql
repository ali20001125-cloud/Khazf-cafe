-- =====================================================================
-- بيع البضاعة: أكياس البنّ والأدوات
--
-- ثلاث حقائق تحكم هذا الباب:
--   ١. البضاعة تُباع في **نفس الفاتورة** مع المشروب — درجٌ واحد ودفعةٌ
--      واحدة، وإلّا ظهرت زيادةٌ في الدرج بلا فاتورة.
--   ٢. **كلفة التغليف للطلب لا للصنف**: عشرة أكياس في كيسٍ واحد بملصقٍ
--      واحد، فتُحسب مرّةً مهما كَثُر ما فيه.
--   ٣. **العزل**: ربح البنّ لا يختلط بربح اللاتيه، وإلّا لم يُعرف أيّهما
--      يكسب. والقسمة من المادة نفسها (`is_retail`) لا من تخمين.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner' limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset
select id as drink  from products where name='أمريكانو' limit 1 \gset

insert into materials (business_id, name, base_unit, low_threshold, current_cost, is_retail)
values (:'biz','بن سيرادو — للبيع','pcs',5,7500,true) returning id as bag \gset
insert into products (business_id, name, category, kind, sort)
values (:'biz','كيس بن ٢٥٠ غ','other','retail',900) returning id as prod \gset
insert into product_crops (product_id, material_id, price, available) values (:'prod',:'bag',25000,true);
insert into recipes (product_id, version, coffee_grams, active) values (:'prod',1,1,true);

select record_purchase(:'biz',:'branch',:'own',:'bag',20,7500,'شراء');
select record_purchase(:'biz',:'branch',:'own',:'crop',5000,25,'شراء');
-- أكواب السفري: بلا رصيدٍ لها لا تمرّ فاتورة سفري أصلاً
insert into inventory_transactions (business_id,branch_id,material_id,type,qty_delta,unit_cost,reason,user_id)
select :'biz',:'branch',id,'PURCHASE',100,150,'رصيد افتتاحي',:'own'
from materials where business_id=:'biz' and base_unit='pcs' and not is_retail;

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

\echo '=== ١. كيسان في فاتورة — ٥٠ ألفاً ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',50000,'r-1',
  jsonb_build_array(jsonb_build_object('product_id',:'prod','crop_material_id',:'bag','qty',2)),
  null,null) ->> 'total' as "المجموع";

\echo '=== ٢. ثمانية أكياس في فاتورة — ٢٠٠ ألف ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',200000,'r-2',
  jsonb_build_array(jsonb_build_object('product_id',:'prod','crop_material_id',:'bag','qty',8)),
  null,null) ->> 'total' as "المجموع";

\echo ''
\echo '=== ٣. التغليف مرّةً لكل طلب، لا لكل كيس ==='
select (retail_day(:'branch')->>'orders')::int         as "طلبات",
       (retail_day(:'branch')->>'units')::int          as "أكياس",
       (retail_day(:'branch')->>'revenue')::int        as "الإيراد",
       (retail_day(:'branch')->>'cogs')::int           as "تكلفة البنّ",
       (retail_day(:'branch')->>'packaging_cost')::int as "تغليف",
       (retail_day(:'branch')->>'profit')::int         as "الربح";

select case when (retail_day(:'branch')->>'packaging_cost')::int = 4000
            then '✓ ٢٬٠٠٠ × طلبين — لا يزيد بعشرة أكياس'
            else format('❌ التغليف %s', (retail_day(:'branch')->>'packaging_cost')) end as "النتيجة";

select case when (retail_day(:'branch')->>'profit')::int = 171000
            then '✓ الربح ٢٥٠٬٠٠٠ − ٧٥٬٠٠٠ − ٤٬٠٠٠ = ١٧١٬٠٠٠'
            else format('❌ الربح %s', (retail_day(:'branch')->>'profit')) end as "النتيجة";

\echo ''
\echo '=== ٤. بضاعةٌ ومشروبٌ في فاتورة واحدة ==='
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',30000,'r-3',
  jsonb_build_array(
    jsonb_build_object('product_id',:'drink','crop_material_id',:'crop','qty',1),
    jsonb_build_object('product_id',:'prod','crop_material_id',:'bag','qty',1)),
  null,null) ->> 'order_number' as o3 \gset

select rs.revenue_drink as "إيراد المشروب", rs.revenue_retail as "إيراد البضاعة"
from v_order_revenue_split rs
join orders o on o.id = rs.order_id where o.order_number = :o3;

select case when rs.revenue_drink > 0 and rs.revenue_retail = 25000
            then '✓ فاتورةٌ واحدة، وإيرادان منفصلان'
            else '❌ لم يُفصل الإيراد' end as "النتيجة"
from v_order_revenue_split rs
join orders o on o.id = rs.order_id where o.order_number = :o3;

\echo ''
\echo '=== ٥. العزل: تكلفة البضاعة لا تدخل تكلفة المشروبات ==='
select cs.cogs_drink as "تكلفة المشروب", cs.cogs_retail as "تكلفة الكيس"
from v_order_cogs_split cs
join orders o on o.id = cs.order_id where o.order_number = :o3;

select case when cs.cogs_retail = 7500 and cs.cogs_drink > 0 and cs.cogs_drink < 7500
            then '✓ التكلفتان منفصلتان — القسمة من المادة لا من تخمين'
            else '❌ اختلطت التكلفتان' end as "النتيجة"
from v_order_cogs_split cs
join orders o on o.id = cs.order_id where o.order_number = :o3;

\echo ''
\echo '=== ٦. الكيس ينقص عدداً، وبنّ المحل لا يُمسّ ==='
select m.name as "المادة", m.cached_stock as "الرصيد"
from materials m where m.id in (:'bag', :'crop') order by m.is_retail;

select case when (select cached_stock from materials where id = :'bag') = 9
            then '✓ ٢٠ − ١١ كيساً = ٩'
            else format('❌ رصيد الأكياس %s', (select cached_stock from materials where id = :'bag')) end
  as "النتيجة";
