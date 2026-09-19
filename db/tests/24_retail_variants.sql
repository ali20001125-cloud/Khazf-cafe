-- =====================================================================
-- مبيعات كل **نوع** من البضاعة
--
-- قال المالك: «كالدي باع كذا والآخر كذا — هذا يفيدني في تحديد الأنواع
-- المطلوبة». فالاختبار هنا اختبار نفعٍ لا صحّة حساب: صنفٌ واحد بثلاثة
-- أنواع يجب أن يُقرأ ثلاثة أسطر، لا سطراً واحداً مجموعاً.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner' limit 1 \gset

insert into materials (business_id, name, base_unit, low_threshold, current_cost, is_retail)
values (:'biz','بن كالدي — للبيع','pcs',5,7500,true) returning id as kaldi \gset
insert into materials (business_id, name, base_unit, low_threshold, current_cost, is_retail)
values (:'biz','بن سيرادو — للبيع','pcs',5,8000,true) returning id as cerrado \gset
insert into materials (business_id, name, base_unit, low_threshold, current_cost, is_retail)
values (:'biz','كوب سيراميك — للبيع','pcs',2,6000,true) returning id as mug \gset

insert into products (business_id, name, category, kind, sort)
values (:'biz','كيس بنّ ٢٥٠ غ','other','retail',900) returning id as bags \gset
insert into products (business_id, name, category, kind, sort)
values (:'biz','كوب خزف','other','retail',901) returning id as mugs \gset

-- صنفٌ بنوعين، وصنفٌ بنوعٍ واحد: الأوّل يُفصَل والثاني لا شيء فيه يُفصَل
insert into product_crops (product_id, material_id, price, available) values
  (:'bags',:'kaldi',25000,true), (:'bags',:'cerrado',27000,true),
  (:'mugs',:'mug',18000,true);
insert into recipes (product_id, version, coffee_grams, active) values
  (:'bags',1,1,true), (:'mugs',1,1,true);

select record_purchase(:'biz',:'branch',:'own',:'kaldi',20,7500,'شراء');
select record_purchase(:'biz',:'branch',:'own',:'cerrado',20,8000,'شراء');
select record_purchase(:'biz',:'branch',:'own',:'mug',10,6000,'شراء');

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

-- ٣ كالدي · ١ سيرادو · ٢ كوب — في فواتير مختلفة كما يقع فعلاً
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',75000,'v-1',
  jsonb_build_array(jsonb_build_object('product_id',:'bags','crop_material_id',:'kaldi','qty',3)),
  null,null) ->> 'total' as t1 \gset
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',27000,'v-2',
  jsonb_build_array(jsonb_build_object('product_id',:'bags','crop_material_id',:'cerrado','qty',1)),
  null,null) ->> 'total' as t2 \gset
select checkout(:'biz',:'branch',:'bar',:'shift','takeaway','cash',36000,'v-3',
  jsonb_build_array(jsonb_build_object('product_id',:'mugs','crop_material_id',:'mug','qty',2)),
  null,null) ->> 'total' as t3 \gset

\echo '=== ١. الأنواع مفصولة، لا مجموعة تحت صنفها ==='
select product_name as "الصنف", variant_name as "النوع",
       units as "بيع", revenue as "الإيراد", profit as "الربح", margin_pct as "الهامش"
from retail_variants(:'biz', 30);

select case when (select count(*) from retail_variants(:'biz',30)
                  where product_id = :'bags') = 2
            then '✓ كيس البنّ سطران — كالدي وسيرادو، لا سطرٌ واحد'
            else format('❌ %s سطراً لكيس البنّ',
                        (select count(*) from retail_variants(:'biz',30) where product_id=:'bags'))
       end as "النتيجة";

\echo ''
\echo '=== ٢. كالدي ٣ وسيرادو ١ — العدد هو المقصود ==='
select case when (select units from retail_variants(:'biz',30) where variant_id=:'kaldi') = 3
             and (select units from retail_variants(:'biz',30) where variant_id=:'cerrado') = 1
            then '✓ كالدي ٣ · سيرادو ١'
            else '❌ الأعداد لا تطابق ما بِيع' end as "النتيجة";

\echo ''
\echo '=== ٣. تكلفة كل نوعٍ تكلفته هو، لا متوسّط الصنف ==='
-- كالدي ٧٬٥٠٠ وسيرادو ٨٬٠٠٠: متوسّطٌ واحد كان سيُخطئ كليهما
select case when (select cogs from retail_variants(:'biz',30) where variant_id=:'kaldi') = 22500
             and (select cogs from retail_variants(:'biz',30) where variant_id=:'cerrado') = 8000
            then '✓ ٣ × ٧٬٥٠٠ و ١ × ٨٬٠٠٠ — لكلّ نوعٍ كلفته'
            else '❌ خُلطت التكاليف' end as "النتيجة";

\echo ''
\echo '=== ٤. مجموع الأنواع = مجموع الصنف في retail_profit ==='
select case when (select sum(units) from retail_variants(:'biz',30) where product_id=:'bags')
               = (select units from retail_profit(:'biz',30) where product_id=:'bags')
             and (select sum(profit) from retail_variants(:'biz',30) where product_id=:'bags')
               = (select profit from retail_profit(:'biz',30) where product_id=:'bags')
            then '✓ التفصيل والمجموع لا يتناقضان'
            else '❌ الشاشة ستُظهر رقمين مختلفين لشيءٍ واحد' end as "النتيجة";

\echo ''
\echo '=== ٥. صنفٌ بنوعٍ واحد: سطرٌ واحد لا يُفصَل عن نفسه ==='
select case when (select count(*) from retail_variants(:'biz',30) where product_id=:'mugs') = 1
            then '✓ الكوب سطرٌ واحد — لا تكرار بلا فائدة'
            else '❌ الكوب تكرّر' end as "النتيجة";

\echo ''
\echo '=== ٦. الملغى لا يُحسب نوعاً مطلوباً ==='
update orders set status='VOIDED' where order_number = (
  select order_number from orders order by order_number desc limit 1);
select case when (select coalesce(sum(units),0) from retail_variants(:'biz',30)
                  where variant_id=:'mug') = 0
            then '✓ فاتورةٌ ملغاة لا تُضخّم الطلب على نوع'
            else '❌ الملغى ما زال معدوداً' end as "النتيجة";
