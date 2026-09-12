-- =====================================================================
-- الربح: الإيراد ليس الربح
--
-- «بعت ٤٨٬٠٠٠» رقمٌ لا يقول شيئاً عن حال المقهى. الذي يقول هو: كم بقي
-- بعد ثمن القهوة والحليب والكوب؟
--
-- ويُختبر هنا الأهمّ: **التكلفة تُختم لحظة البيع، فلا يتبدّل ربح الأمس
-- إذا غلا كيلو القهوة اليوم.** تقريرٌ يتغيّر بعد أن قُرئ لا يُبنى عليه قرار.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches   limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner'   limit 1 \gset
select id as latte  from products where name='لاتيه'   limit 1 \gset
select id as esp    from products where name='إسبريسو' limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset

update branches set day_start_hour = 5 where id = :'branch';

\echo '=== الإعداد: شراء بأسعار معروفة عبر `record_purchase` ==='
-- الدالة الحقيقية لا إدراجٌ مباشر: هي التي تحسب التكلفة المرجّحة. ولو
-- أدرجنا الصفوف يداً لبقيت `current_cost` على قيمة البيانات الأوّلية،
-- ولنجح اختبار «الغلاء» كذباً لأن شيئاً لم يتغيّر أصلاً.
select record_purchase(:'biz', :'branch', :'own', id,
         case base_unit when 'g' then 5000 when 'ml' then 12000 else 300 end,
         case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,
         'رصيد افتتاحي')
from materials where business_id = :'biz' and active;

select name, base_unit, current_cost as "التكلفة/وحدة", material_dose(id) as "الجرعة"
from materials where active and business_id = :'biz' order by name;

\echo ''
\echo '=== بيع: ٤ لاتيه + ٢ إسبريسو (سفري) ==='
insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as sh \gset

select checkout(:'biz',:'branch',:'bar',:'sh','takeaway','cash',12000,'p-l-'||g,
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),
  null,null) from generate_series(1,4) g;
select checkout(:'biz',:'branch',:'bar',:'sh','takeaway','cash',2000,'p-e-'||g,
  jsonb_build_array(jsonb_build_object('product_id',:'esp','crop_material_id',:'crop','qty',1)),
  null,null) from generate_series(1,2) g;

\echo ''
\echo '=== ١. التكلفة مختومة على كل حركة استهلاك ==='
select type, count(*) as "حركات",
       count(*) filter (where unit_cost is null) as "بلا تكلفة"
from inventory_transactions where order_id is not null
group by type;

\echo ''
\echo '=== ٢. تكلفة فاتورة لاتيه سفري، محسوبة من الوصفة والأسعار ==='
-- لاتيه سفري = ١٨غ حبوب + ١٨٠مل حليب + كوب + غطاء، كلٌّ بسعره الفعلي
select (select 18 * current_cost from materials where id = :'crop')
     + (select 180 * current_cost from materials where name='حليب' and business_id=:'biz')
     + (select current_cost from materials where name='كوب سفري' and business_id=:'biz')
     + (select current_cost from materials where name='غطاء' and business_id=:'biz')
       as expected \gset
select :expected as "المحسوب من الوصفة",
       (select c.cogs from v_order_cogs c
         join orders o on o.id = c.order_id
        where o.order_number = 1001) as "ما حسبه النظام";

\echo ''
\echo '=== ٣. ربح اليوم ==='
select (day_profit(:'branch')->>'orders')::int       as "فواتير",
       (day_profit(:'branch')->>'revenue')::int      as "الإيراد",
       (day_profit(:'branch')->>'cogs')::int         as "تكلفة المبيع",
       ((day_profit(:'branch')->>'revenue')::int
        - (day_profit(:'branch')->>'cogs')::int)     as "الربح",
       (day_profit(:'branch')->>'orders_costed')::int || '/' ||
       (day_profit(:'branch')->>'orders_total')::text as "تغطية التكلفة";

\echo ''
\echo '=== ٤. ربح كل مشروب ==='
select name as "المشروب", cups as "أكواب", revenue as "إيراد",
       cogs as "تكلفة", profit as "ربح", margin_pct as "هامش٪",
       profit_per_cup as "ربح الكوب"
from product_profit(:'biz', 30) where cups > 0 order by profit desc;

\echo ''
\echo '=== ٥. الاختبار الحاسم: غلاء القهوة لا يغيّر ربح الأمس ==='
select (day_profit(:'branch')->>'cogs')::int as cogs_before \gset
select current_cost as cost_before from materials where id = :'crop' \gset
-- شراء جديد بضعف السعر يرفع التكلفة المرجّحة فعلاً
select record_purchase(:'biz',:'branch',:'own',:'crop',10000,50,'غلاء السعر');
select :cost_before as "تكلفة الحبوب قبل",
       (select current_cost from materials where id = :'crop') as "وبعد الشراء الغالي";
select (day_profit(:'branch')->>'cogs')::int as cogs_after \gset
select :cogs_before as "تكلفة المبيع قبل الغلاء",
       :cogs_after  as "وبعده",
       case when :cogs_before = :cogs_after
            then '✓ لم تتغيّر — التكلفة مختومة يوم البيع'
            else '✗ تغيّرت — الربح يُحسب من سعر اليوم' end as "الحكم";

\echo ''
\echo '=== ٦. الإرجاع يُنقص الإيراد لا التكلفة ==='
-- المواد استُهلكت فعلاً ولا تعود، فالإرجاع يقضم الربح كلّه
select id as ord from orders where order_type='SALE' order by order_number limit 1 \gset
select (day_profit(:'branch')->>'revenue')::int as rev_before \gset
insert into refunds (business_id,branch_id,order_id,shift_id,amount,method,reason,
                     requested_by,approved_by,status,idempotency_key,completed_at)
values (:'biz',:'branch',:'ord',:'sh',3000,'cash','زبون غير راضٍ',:'own',:'own','COMPLETED','rf-profit-1',now());
select (day_profit(:'branch')->>'revenue')::int as rev_after \gset
select :rev_before as "الإيراد قبل الإرجاع", :rev_after as "وبعده",
       (day_profit(:'branch')->>'refunds')::int as "المُرجَع",
       case when :rev_before - :rev_after = 3000 then '✓ نقص بمقدار المُرجَع'
            else '✗ حساب خاطئ' end as "الحكم";

\echo ''
\echo '=== ٧. الهدر ومشروب الموظف: تكلفة بلا إيراد ==='
-- التقويم بتكلفة **لحظة الهدر**، وهي الآن ٤٢ بعد الشراء الغالي في ٥ —
-- لا ٢٥ التي كانت وقت البيع. فنقرأ السعر الساري قبل أن نهدر.
select current_cost as cost_now from materials where id = :'crop' \gset
select record_waste(:'biz',:'branch',:'bar',:'crop',100,'dial_in');
select staff_drink(:'biz',:'branch',:'bar',:'sh',:'latte',:'crop','dine_in',null);
select :cost_now as "تكلفة الغرام لحظة الهدر",
       (day_profit(:'branch')->>'waste_cost')::int as "تكلفة الهدر",
       (day_profit(:'branch')->>'cogs_free')::int  as "تكلفة المجاني",
       (day_profit(:'branch')->>'free_drinks')::int as "أكواب مجانية";

\echo ''
\echo '=== ٨. فاتورة بلا تكلفة مسجّلة: «لا أعرف» لا «هامش ١٠٠٪» ==='
-- هذا ما كشفه أوّل تشغيل على القاعدة الحيّة: ٣١ بيعاً من قبل ختم التكلفة
-- ظهرت بربح = الإيراد كاملاً وهامش ١٠٠٪. الرقم الخاطئ الواثق أسوأ من
-- الفراغ الصريح. نُحاكي تلك الحالة: صفّ دفتر بلا تكلفة (بتجاوز المُشغّل،
-- كما كانت الصفوف القديمة فعلاً).
select checkout(:'biz',:'branch',:'bar',:'sh','takeaway','cash',5000,'p-old-1',
  jsonb_build_array(jsonb_build_object('product_id',:'esp','crop_material_id',:'crop','qty',1)),
  null,null) as old_order \gset
select (:'old_order'::jsonb->>'order_id') as old_id \gset
set session_replication_role = replica;
update inventory_transactions set unit_cost = null where order_id = :'old_id';
set session_replication_role = origin;

select cogs, cost_complete as "التكلفة مكتملة؟"
from v_order_cogs where order_id = :'old_id';

select name as "المشروب", cups as "أكواب", costed_cups as "منها مختومة",
       coalesce(profit::text, '— غير معروف') as "الربح",
       coalesce(margin_pct::text, '—') as "الهامش"
from product_profit(:'biz', 30) where cups > 0 order by name;

select (day_profit(:'branch')->>'orders_costed')::int || ' من ' ||
       (day_profit(:'branch')->>'orders_total')::text as "تغطية التكلفة اليوم";

\echo ''
\echo '=== الخلاصة ==='
-- (فاتورة الخطوة ٨ مستثناة: جُرّدت من تكلفتها عن قصد لمحاكاة ما قبل الختم)
select case when (select count(*) from inventory_transactions
                   where order_id is not null and order_id <> :'old_id'
                     and unit_cost is null) = 0
       then '✓ كل حركة استهلاك مختومة التكلفة تلقائياً'
       else '✗ حركات بلا تكلفة' end as result
union all
select case when (select c.cogs from v_order_cogs c
                   join orders o on o.id = c.order_id
                  where o.order_number = 1001) = :expected
       then '✓ تكلفة الفاتورة تطابق الوصفة بالدينار'
       else '✗ تكلفة الفاتورة خاطئة' end
union all
select case
  when (select current_cost from materials where id = :'crop') = :cost_before
    then '✗ الاختبار بلا معنى: التكلفة المرجّحة لم تتحرّك أصلاً'
  when :cogs_before = :cogs_after
    then '✓ غلاء القهوة لا يغيّر ربح يومٍ مضى (والتكلفة تحرّكت فعلاً)'
  else '✗ الربح يتبدّل بعد أن قُرئ' end
union all
select case when (select (day_profit(:'branch')->>'waste_cost')::int) = 100 * :cost_now
       then '✓ الهدر مُقوَّم بتكلفة لحظته (١٠٠غ × ' || :cost_now || ')'
       else '✗ تقويم الهدر خاطئ' end
union all
select case
  when (select cost_complete from v_order_cogs where order_id = :'old_id') = false
   and (select count(*) from product_profit(:'biz', 30)
         where cups > 0 and costed_cups = 0 and margin_pct is not null) = 0
  then '✓ ما لا تكلفة له يُعرض فارغاً — لا هامش ١٠٠٪ كاذب'
  else '✗ فاتورة بلا تكلفة تُعرض كأنها كلّها ربح' end
union all
select case
  when (select (day_profit(:'branch')->>'orders_costed')::int)
     < (select (day_profit(:'branch')->>'orders_total')::int)
  then '✓ التغطية الناقصة مُعلَنة بالعدد لا مخفيّة'
  else '✗ التغطية لا تُعلَن' end;
