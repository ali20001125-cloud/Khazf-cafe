-- =====================================================================
-- نسخ الوصفة · وربط المحصول بالمشروب
--
-- الفاتورة محفوظةٌ بوصفتها، فالتاريخ المالي سليم بلا هذا كلّه. لكن سؤال
-- المالك بعد شهرين ليس «كم كلّفني اللاتيه في آذار؟» فحسب، بل **متى
-- غيّرناه؟** — وتعديلٌ يكتب فوق الصفّ لا يجيب.
--
-- والمحاصيل: «كالدي إسبريسو وتقطير فقط» ليست ملاحظةً على ورقة، هي صفّ
-- في القاعدة يمنع بيع ما لا يُحضَّر.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as own    from users where role='owner' limit 1 \gset
select id as latte  from products where name='لاتيه' limit 1 \gset
select id as esp    from products where name='إسبريسو' limit 1 \gset
select id as milk   from materials where name='حليب' limit 1 \gset
select id as cup    from materials where base_unit='pcs' order by name limit 1 \gset
select id as kaldi  from materials where name='حبوب كالدي' limit 1 \gset

\echo '=== ١. الوصفة الحالية ==='
select version as "النسخة", coffee_grams as "حبوب", items as "المكوّنات"
from v_recipe_history where recipe_id = (select id from recipes where product_id=:'latte' and active);

select version as v0 from recipes where product_id=:'latte' and active \gset

\echo ''
\echo '=== ٢. تغيير الحليب من ١٨٠ إلى ٢٠٠ ==='
select set_recipe(:'biz', :'latte', :'own', 18,
  jsonb_build_array(
    jsonb_build_object('material_id', :'milk', 'qty', 200, 'only_takeaway', false),
    jsonb_build_object('material_id', :'cup',  'qty', 1,   'only_takeaway', true)
  )) as "النتيجة";

select version as v1, coffee_grams as g1 from recipes where product_id=:'latte' and active \gset
select count(*)::int as versions from recipes where product_id=:'latte' \gset

\echo ''
\echo '=== ٣. النسخة القديمة باقية ومعطَّلة ==='
select version as "النسخة", active as "فعّالة", coffee_grams as "حبوب", items as "المكوّنات"
from v_recipe_history where product_id = :'latte' order by version;

\echo ''
\echo '=== ٤. حفظٌ بلا تغيير لا يصنع نسخة ==='
select set_recipe(:'biz', :'latte', :'own', 18,
  jsonb_build_array(
    jsonb_build_object('material_id', :'cup',  'qty', 1,   'only_takeaway', true),
    jsonb_build_object('material_id', :'milk', 'qty', 200, 'only_takeaway', false)
  ))->>'changed' as "تغيّر؟";
select count(*)::int as versions_after from recipes where product_id=:'latte' \gset

\echo ''
\echo '=== ٥. التغيير مكتوب في سجلّ التدقيق ==='
select action as "الحدث", reason as "السبب",
       before->>'coffee_grams' as "حبوب قبل", after->>'coffee_grams' as "حبوب بعد"
from audit_log where action = 'recipe_change' order by created_at desc limit 2;
select count(*)::int as audits from audit_log where action='recipe_change' \gset

\echo ''
\echo '=== ٦. كالدي للإسبريسو فقط — لا يظهر في اللاتيه ==='
insert into product_crops (product_id, material_id, price, available)
values (:'esp', :'kaldi', 4000, true)
on conflict (product_id, material_id) do update set available = true;

select p.name as "المشروب", m.name as "المحصول", pc.price as "السعر", pc.available as "متاح"
from product_crops pc join products p on p.id=pc.product_id join materials m on m.id=pc.material_id
where m.id = :'kaldi';

select count(*)::int as kaldi_on_latte
from product_crops where product_id=:'latte' and material_id=:'kaldi' and available \gset

\echo ''
\echo '=== ٧. إيقاف محصول لا يحذفه ==='
update product_crops set available=false where product_id=:'esp' and material_id=:'kaldi';
select count(*)::int as kaldi_rows from product_crops where product_id=:'esp' and material_id=:'kaldi' \gset
select count(*)::int as kaldi_available from product_crops where product_id=:'esp' and material_id=:'kaldi' and available \gset

\echo ''
\echo '=== الخلاصة ==='
select case when :v1 = :v0 + 1 and :versions = 2
       then '✓ التعديل صنع نسخةً جديدة، والقديمة باقية'
       else format('✗ النسخة %s والعدد %s', :v1, :versions) end as result
union all
select case when (select coffee_grams from recipes where product_id=:'latte' and version=:v0) is not null
              and (select not active from recipes where product_id=:'latte' and version=:v0)
       then '✓ النسخة القديمة معطَّلة لا ممحوّة — يُقرأ منها تاريخ التغيير'
       else '✗ ضاعت النسخة القديمة' end
union all
select case when :versions_after = :versions
       then '✓ حفظٌ بلا تغيير لا يُغرق التاريخ بنسخٍ فارغة'
       else format('✗ صارت %s نسخة', :versions_after) end
union all
select case when :audits = 1
       then '✓ تغيير الوصفة مكتوب في سجلّ التدقيق بقبله وبعده'
       else format('✗ صفوف تدقيق %s', :audits) end
union all
select case when :kaldi_on_latte = 0
       then '✓ المحصول يُربط بمشروبٍ بعينه — كالدي لا يظهر على اللاتيه'
       else '✗ ظهر كالدي على مشروب لم يُربط به' end
union all
select case when :kaldi_rows = 1 and :kaldi_available = 0
       then '✓ إيقاف المحصول يُخفيه من البيع ويُبقي تاريخه مقروءاً'
       else format('✗ صفوف %s · متاح %s', :kaldi_rows, :kaldi_available) end;
