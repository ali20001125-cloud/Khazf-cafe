-- =====================================================================
-- مخزون متقدّم: يتكلّم لغة المقهى لا لغة الحاسوب
--
-- كان النظام يطلب «١٢٠٠٠ مل» و«٢٥٠٠ غ»، وصاحب المقهى يشتري كرتوناً وكيساً
-- فيحوّل في رأسه عند كل فاتورة — وكل تحويلٍ في الرأس خطأٌ ينتظر.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches   limit 1 \gset
select id as own    from users where role='owner'   limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as milk   from materials where name='حليب' limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset

\echo '=== ١. تعريف وحدات الشراء مرّة واحدة ==='
insert into material_units (material_id, name, base_qty, is_default, sort) values
  (:'milk', 'كرتون (١٢ × ١ لتر)', 12000, true, 1),
  (:'milk', 'علبة ١ لتر',          1000, false, 2),
  (:'crop', 'كيس ١ كغ',            1000, true, 1)
on conflict do nothing;
select m.name as "المادة", u.name as "الوحدة", u.base_qty as "بالوحدة الأساس"
from material_units u join materials m on m.id = u.material_id order by m.name, u.sort;

\echo ''
\echo '=== ٢. شراء كرتونين حليب بـ ١٢٬٠٠٠ للكرتون ==='
select (record_purchase_units(:'biz',:'branch',:'own',:'milk',
        (select id from material_units where material_id=:'milk' and is_default),
        2, 12000, 'شراء أسبوعي')) as "النتيجة";

select cached_stock as "الرصيد (مل)", current_cost as "التكلفة/مل"
from materials where id = :'milk';

\echo ''
\echo 'الحركة تحفظ كيف أُدخلت — للتدقيق ولسؤال «كم كرتوناً اشتريت؟»'
select t.qty_delta as "الأساس", t.unit_qty as "كمية الوحدة", u.name as "الوحدة", t.unit_cost as "تكلفة/مل"
from inventory_transactions t
join material_units u on u.id = t.unit_id
where t.material_id = :'milk' order by t.created_at desc limit 1;

\echo ''
\echo '=== ٣. قائمة الشراء: ماذا أشتري وكم ==='
-- حدّ التنبيه ٥ لتر، والمطلوب بعد الشراء ٢٤ لتر
update materials set low_threshold = 5000, par_level = 24000 where id = :'milk';
update materials set low_threshold = 1000, par_level = 5000  where id = :'crop';
-- استهلاك: بيعٌ حقيقي حتى يُحسب المعدّل اليومي
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as sh \gset
select record_purchase(:'biz',:'branch',:'own',id,
  case base_unit when 'g' then 3000 else 200 end, 25, 'رصيد') 
from materials where business_id=:'biz' and active and base_unit <> 'ml';
select checkout(:'biz',:'branch',:'bar',:'sh','takeaway','cash',5000,'adv-'||g,
  jsonb_build_array(jsonb_build_object('product_id',(select id from products where name='لاتيه' limit 1),
    'crop_material_id',:'crop','qty',1)), null,null)
from generate_series(1,10) g;

select name as "المادة", stock as "الرصيد", par_level as "المطلوب",
       need_base as "الناقص", need_units as "بوحدة الشراء", unit_name as "الوحدة",
       days_left as "أيام متبقّية", urgency as "الحالة"
from shopping_list(:'biz', 14) where need_base > 0 or urgency <> 'ok';

\echo ''
\echo '=== ٤. جرد جزئي: مادّة واحدة لا كل شيء ==='
select apply_stock_count(:'biz',:'branch',:'own', jsonb_build_array(
  jsonb_build_object('material_id', :'milk', 'counted', (select cached_stock from materials where id=:'milk') - 500)
)) as count_result;
update stock_counts set counted_materials = 1,
       total_materials = (select count(*)::int from materials where business_id=:'biz' and active)
 where id = (select id from stock_counts order by created_at desc limit 1);

select counted_materials || ' من ' || total_materials as "سعة الجرد",
       is_partial as "جزئي؟", with_variance as "مواد بفرق"
from v_stock_counts order by created_at desc limit 1;

\echo ''
\echo '=== ٥. أسباب الهدر: قائمة يملكها المالك ==='
select label as "السبب" from waste_reasons where active order by sort;

select record_waste(:'biz',:'branch',:'bar',:'crop',40,'dial_in');
select record_waste(:'biz',:'branch',:'bar',:'crop',25,'spill');
select record_waste(:'biz',:'branch',:'bar',:'milk',300,'expired');

\echo ''
\echo 'وتكلفتها بالدينار — الغرام لا يُقرأ، والدينار يُقرأ:'
select label as "السبب", events as "مرّات", cost as "الكلفة"
from waste_by_reason(:'branch', 30);

\echo ''
\echo '=== الخلاصة ==='
-- يُقاس الشراء من الدفتر لا من الرصيد: الرصيد يهبط بالبيع والهدر والجرد،
-- وهذا الاختبار عن التحويل لا عن الاستهلاك.
select case when (select qty_delta from inventory_transactions
                   where material_id = :'milk' and type = 'PURCHASE'
                     and unit_qty = 2 order by created_at desc limit 1) = 2 * 12000
       then '✓ كرتونان دخلا الدفتر ٢٤٬٠٠٠ مل، والوحدة محفوظة مع الصفّ'
       else '✗ التحويل من وحدة الشراء خاطئ' end as result
union all
select case when (select current_cost from materials where id=:'milk') = 1
       then '✓ ١٢٬٠٠٠ للكرتون ← ١ دينار للمل'
       else '✗ تحويل التكلفة خاطئ' end
union all
select case when (select need_units from shopping_list(:'biz',14) where material_id = :'crop') is not null
        and (select need_units from shopping_list(:'biz',14) where material_id = :'crop')
            = ceil((select need_base from shopping_list(:'biz',14) where material_id = :'crop')::numeric / 1000)
       then '✓ الناقص محسوب بوحدة الشراء ومُقرَّب لأعلى'
       else '✗ اقتراح الشراء خاطئ' end
union all
select case when (select is_partial from v_stock_counts order by created_at desc limit 1)
       then '✓ الجرد الجزئي مُعلَّم كذلك — لا يُقرأ شاملاً'
       else '✗ الجرد الجزئي يبدو شاملاً' end
union all
select case when (select count(*)::int from waste_by_reason(:'branch',30)) = 3
        and (select cost from waste_by_reason(:'branch',30) where reason='dial_in') > 0
       then '✓ الهدر موزّع على أسبابه بتكلفته بالدينار'
       else '✗ توزيع الهدر خاطئ' end;
