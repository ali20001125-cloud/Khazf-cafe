-- =====================================================================
-- المنيو الإلكتروني
--
-- المنيو صفحةٌ يفتحها **من لا حساب له**، فاختباره اختبار حدّين:
--   ١. ما يجب أن يُعرض يُعرض — ومنه الموقوف، مؤشَّراً لا محذوفاً: زبونٌ
--      يقرأ صنفاً ثم لا يجده في المنيو غداً يظنّ أنه أخطأ القراءة.
--   ٢. ما لا يجب أن يخرج لا يخرج — لا تكلفة ولا رصيد ولا معرّف مادة.
--      عمودٌ زائدٌ هنا لا يلاحظه أحد حتى يقرأه منافس.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz from businesses limit 1 \gset
select id as latte from products where name='لاتيه' limit 1 \gset
select id as mocha from products where name='موكا' limit 1 \gset
select id as capp  from products where name='كابتشينو' limit 1 \gset
select id as espid from products where name='إسبريسو' limit 1 \gset

\echo '=== ١. الافتراضي: كل منتجٍ فعّال في المنيو ==='
select count(*)::int as "في المنيو",
       (select count(*)::int from products where business_id=:'biz' and active) as "الفعّالة"
from public_menu(:'biz');

select case when (select count(*) from public_menu(:'biz'))
              = (select count(*) from products p
                 where p.business_id=:'biz' and p.active
                   and exists (select 1 from product_crops pc
                               where pc.product_id=p.id and pc.available))
            then '✓ لا منتج يغيب عن المنيو بلا قرارٍ من المالك'
            else '❌ منتجٌ غاب بلا سبب' end as "النتيجة";

\echo ''
\echo '=== ٢. ما يُخفيه المالك يختفي ==='
update products set menu_visible = false where id = :'capp';
select case when not exists (select 1 from public_menu(:'biz') where product_id=:'capp')
            then '✓ كابتشينو اختفى من منيو الزبون'
            else '❌ ما زال معروضاً' end as "النتيجة";

select case when exists (select 1 from products where id=:'capp' and active)
            then '✓ وبقي في الكاشير — الإخفاء عرضٌ لا حذف'
            else '❌ أُطفئ المنتج نفسه' end as "النتيجة";

\echo ''
\echo '=== ٣. الموقوف يُعرض مؤشَّراً، لا يُحذف ==='
update products set paused = true where id = :'mocha';
select name as "الصنف", paused as "موقوف" from public_menu(:'biz') where product_id=:'mocha';

select case when (select paused from public_menu(:'biz') where product_id=:'mocha')
            then '✓ موكا معروضة و«غير متوفّرة» — لا تختفي فيظنّ الزبون أنه أخطأ'
            else '❌ الإيقاف لم يصل المنيو' end as "النتيجة";

\echo ''
\echo '=== ٤. السطر تحت الاسم يصل كما كُتب ==='
update products set menu_note = 'إسبريسو مزدوج وحليب مبخّر' where id = :'latte';
select case when (select note from public_menu(:'biz') where product_id=:'latte')
                 = 'إسبريسو مزدوج وحليب مبخّر'
            then '✓ كلام المالك يصل الزبون بلا تحرير'
            else '❌ السطر ضاع' end as "النتيجة";

\echo ''
\echo '=== ٥. سعرٌ من المحاصيل المتاحة وحدها ==='
-- محصولٌ قائم يُرفع سعره ويُطفأ: لا يجب أن يزحف إلى مدى السعر المعروض.
-- ولا يُنشأ محصولٌ جديد هنا — `_reset` يُعيد كل مُطفأٍ متاحاً، فمحصولٌ
-- بـ٩٩ ألفاً كان سيبقى في الكتالوج ويُفسد ما بعده.
select pc.id as cid, pc.price as oldprice
from product_crops pc join products p on p.id = pc.product_id
where p.id = :'espid' order by pc.price limit 1 \gset

update product_crops set price = 99000, available = false where id = :'cid';

select case when (select max_price from public_menu(:'biz') where product_id=:'espid') < 99000
            then '✓ المحصول المُطفأ لا يرفع السعر المعروض'
            else '❌ سعرٌ غير مُتاحٍ ظهر للزبون' end as "النتيجة";

update product_crops set price = :oldprice, available = true where id = :'cid';

\echo ''
\echo '=== ٦. المميّز يصل المنيو بلا عمودٍ جديد ==='
-- `is_daily_special` قائمةٌ في الجدول ولا قارئ لها؛ المنيو فتحها
update products set is_daily_special = true where id = :'latte';
select case when (select special from public_menu(:'biz') where product_id=:'latte')
             and not (select special from public_menu(:'biz') where product_id=:'espid')
            then '✓ المميّز مميَّز، وغيره لا'
            else '❌ راية التمييز لا تصل المنيو' end as "النتيجة";

\echo ''
\echo '=== ٧. لا يخرج من المنيو ما لا يخصّ الزبون ==='
-- الأعمدة نفسها هي العقد: تكلفةٌ أو رصيدٌ أو معرّف مادة = تسريب. وهذا
-- اختبارٌ على الشكل لا على القيم، لأن التسريب يدخل بإضافة عمودٍ لا بخطأ.
select string_agg(n, ' · ') as "ما يخرج للزبون"
from (select unnest(proargnames) as n, generate_subscripts(proargnames, 1) as i
      from pg_proc where proname = 'public_menu') q
where i > 1;

-- `proargnames[1]` هو المدخل `p_business`، لا مخرجاً — فالفحص يبدأ من ٢
select case when not exists (
              select 1
              from (select unnest(proargnames) as n,
                           generate_subscripts(proargnames, 1) as i
                    from pg_proc where proname = 'public_menu') q
              where i > 1 and n ~ '(cost|stock|business|material_id)'
            )
            then '✓ لا تكلفة ولا رصيد ولا معرّف مادة في مخرجات المنيو'
            else '❌ عمودٌ داخليّ يخرج للعلن' end as "النتيجة";
