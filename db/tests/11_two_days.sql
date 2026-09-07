-- =====================================================================
-- محاكاة يومين: يوم نظيف ويوم فيه سرقة
--
-- الغاية: هل يكشف النظام السرقة **بلا أن يتّهم الأمين**؟ نظام يصرخ كل يوم
-- عديم الفائدة تماماً كنظام لا يصرخ أبداً — فالمالك يتوقّف عن النظر.
--
-- اليوم الأول: باريستا أمين. بيع، هدر صادق، مشروب موظف واحد، عدّ درج، جرد.
--             **المطلوب: لا تنبيه واحد.**
--
-- اليوم الثاني: نفس اليوم ظاهرياً، لكن الباريستا:
--   (أ) يحضّر ٣ مشروبات ويأخذ ثمنها نقداً بلا تسجيل  ← المواد تنقص والدرج
--       سليم، فلا يُكشف إلا بالجرد.
--   (ب) يسجّل بيعاً ثم يأخذ ٥٬٠٠٠ من الدرج           ← الدرج ينقص.
--   (ج) يسجّل هدراً وهمياً ٢٠٠غ ليغطّي (أ)            ← الهدر يقفز.
--   **المطلوب: يُكشف كل واحد منها بإشارة مختلفة.**
--
-- ملاحظة على الزمن: الدوال تعمل بوقت الخادم الحقيقي، ثم نُزحزح تواريخ
-- الطلبات والورديات والجرد يوماً للخلف لتقع الدفعة الأولى في يوم محاسبي
-- سابق. الحسابات نفسها لم تُمسّ — الدوال الحقيقية هي التي نفّذت كل شيء.
-- =====================================================================
\pset pager off
\set QUIET on

-- ── تصفير ───────────────────────────────────────────────────────────
truncate loyalty_ledger, loyalty_rewards, loyalty_accounts, order_item_modifiers,
         order_discounts, refund_items, refunds, order_voids, payments, order_items,
         inventory_transactions, cash_movements, orders, shifts, customers, audit_log,
         stock_count_items, stock_counts, no_sale_opens, drawer_handovers, day_closes
restart identity cascade;
update order_counters set next_number = 1001;

select id as biz    from businesses limit 1 \gset
select id as branch from branches   limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner'   limit 1 \gset
select id as latte  from products where name='لاتيه'   limit 1 \gset
select id as esp    from products where name='إسبريسو' limit 1 \gset
select id as crop   from materials where name='حبوب الدورادو' limit 1 \gset
select id as milk   from materials where name='حليب' limit 1 \gset

update branches set day_start_hour = 5, standard_float = 50000 where id = :'branch';

-- رصيد افتتاحي: ٥ كيلو حبوب · ١٢ لتر حليب · ٣٠٠ كوب وغطاء
insert into inventory_transactions (business_id,branch_id,material_id,type,qty_delta,unit_cost,reason,user_id)
select :'biz', :'branch', id, 'PURCHASE',
       case base_unit when 'g' then 5000 when 'ml' then 12000 else 300 end,
       case base_unit when 'g' then 25 when 'ml' then 2 else 150 end,
       'رصيد افتتاحي', :'own'
from materials where business_id = :'biz' and active;

\echo '╔════════════════════════════════════════════════════════╗'
\echo '║  اليوم الأول — باريستا أمين                            ║'
\echo '╚════════════════════════════════════════════════════════╝'

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as sh1 \gset

-- ١٢ لاتيه + ٦ إسبريسو نقداً (لاتيه 3000 · إسبريسو 2000)
select checkout(:'biz',:'branch',:'bar',:'sh1','takeaway','cash',10000,'d1-l-'||g,
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),
  null,null) from generate_series(1,12) g;
select checkout(:'biz',:'branch',:'bar',:'sh1','takeaway','cash',5000,'d1-e-'||g,
  jsonb_build_array(jsonb_build_object('product_id',:'esp','crop_material_id',:'crop','qty',1)),
  null,null) from generate_series(1,6) g;

-- هدر صادق: معايرة الصباح ٣٦غ (جرعتان)
select record_waste(:'biz',:'branch',:'bar',:'crop',36,'dial_in');
-- مشروب الموظف: واحد ضمن الحدّ
select staff_drink(:'biz',:'branch',:'bar',:'sh1',:'latte',:'crop','dine_in',null);

-- الإغلاق: الباريستا يعدّ الدرج بأمانة
select shift_expected_cash(:'sh1') as expected_d1 \gset
select close_shift_blind(:'sh1', :'bar', :expected_d1);

-- الجرد: المعدود = المتوقّع (لا شيء ضاع)
select apply_stock_count(:'biz',:'branch',:'own', jsonb_build_array(
  jsonb_build_object('material_id',:'crop','counted',(select cached_stock from materials where id=:'crop')),
  jsonb_build_object('material_id',:'milk','counted',(select cached_stock from materials where id=:'milk'))
)) as count_d1 \gset

-- زحزحة اليوم الأول للخلف يوماً كاملاً.
-- `session_replication_role = replica` يوقف مُشغّلات المستخدم مؤقتاً — لأن
-- دفتر المخزون ودفتر التدقيق **لا يقبلان تعديلاً** بحكم مُشغّل (وهذا مُثبَت
-- في 02_integrity.sql). ما نفعله هنا ليس ثغرة: نحن نُمثّل مرور يوم، وهو ما
-- يفعله الزمن في المقهى الحقيقي بلا أن يلمس أحد صفاً.
set session_replication_role = replica;
update orders      set created_at   = created_at   - interval '1 day',
                       paid_at      = paid_at      - interval '1 day',
                       completed_at = completed_at - interval '1 day'
 where shift_id = :'sh1';
update shifts      set opened_at = opened_at - interval '1 day',
                       closed_at = closed_at - interval '1 day' where id = :'sh1';
update stock_counts set created_at = created_at - interval '1 day';
-- كل حركة مخزون كُتبت حتى الآن تخصّ اليوم الأول (الشراء الافتتاحي والبيع
-- والهدر الصادق ومشروب الموظف والجرد)
update inventory_transactions set created_at = created_at - interval '1 day';
set session_replication_role = origin;

select business_day((select opened_at from shifts where id=:'sh1'), :'branch') as day1 \gset
\echo 'اليوم المحاسبي الأول:' :day1

\echo ''
\echo '╔════════════════════════════════════════════════════════╗'
\echo '║  اليوم الثاني — نفس البيع ظاهرياً، وفيه سرقة           ║'
\echo '╚════════════════════════════════════════════════════════╝'

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as sh2 \gset

-- نفس حجم البيع المسجَّل: ١٢ لاتيه + ٦ إسبريسو
select checkout(:'biz',:'branch',:'bar',:'sh2','takeaway','cash',10000,'d2-l-'||g,
  jsonb_build_array(jsonb_build_object('product_id',:'latte','crop_material_id',:'crop','qty',1)),
  null,null) from generate_series(1,12) g;
select checkout(:'biz',:'branch',:'bar',:'sh2','takeaway','cash',5000,'d2-e-'||g,
  jsonb_build_array(jsonb_build_object('product_id',:'esp','crop_material_id',:'crop','qty',1)),
  null,null) from generate_series(1,6) g;

select record_waste(:'biz',:'branch',:'bar',:'crop',36,'dial_in');
select staff_drink(:'biz',:'branch',:'bar',:'sh2',:'latte',:'crop','dine_in',null);

\echo ''
\echo '── (أ) ٣ مشروبات بلا تسجيل: المواد تُستهلك والمال في جيبه ──'
-- ما يحدث فعلياً: القهوة والحليب يخرجان من الجرّة، ولا فاتورة ولا حركة.
-- النظام لا يرى شيئاً الآن — سيظهر عند الجرد كنقص لا يفسّره شيء.
\echo '(لا تُسجَّل أي حركة — هذا بالضبط ما يجعلها غير مرئية حتى الجرد)'

\echo ''
\echo '── (ب) يأخذ ٥٬٠٠٠ من الدرج ──'
\echo '(لا حركة أيضاً — الدرج سينقص عند العدّ)'

\echo ''
\echo '── (ج) هدر وهمي ٢٠٠غ ليغطّي ما أخذه ──'
select record_waste(:'biz',:'branch',:'bar',:'crop',200,'spill') as after_fake_waste;

-- الإغلاق: يعدّ الدرج ناقصاً ٥٬٠٠٠ (ما أخذه)
select shift_expected_cash(:'sh2') as expected_d2 \gset
select close_shift_blind(:'sh2', :'bar', :expected_d2 - 5000);

-- الجرد: المعدود أقلّ بمقدار ما استهلكته المشروبات الثلاثة غير المسجّلة
-- (٣ × ١٨غ = ٥٤غ حبوب · ٣ × ١٨٠مل = ٥٤٠مل حليب)
select apply_stock_count(:'biz',:'branch',:'own', jsonb_build_array(
  jsonb_build_object('material_id',:'crop','counted',(select cached_stock from materials where id=:'crop') - 54),
  jsonb_build_object('material_id',:'milk','counted',(select cached_stock from materials where id=:'milk') - 540)
)) as count_d2 \gset

select business_day((select opened_at from shifts where id=:'sh2'), :'branch') as day2 \gset
\echo 'اليوم المحاسبي الثاني:' :day2

\echo ''
\echo '╔════════════════════════════════════════════════════════╗'
\echo '║  ما يراه المالك                                        ║'
\echo '╚════════════════════════════════════════════════════════╝'
\echo ''
\echo '── لوحة اليوم: اليومان متطابقان في المبيعات ──'
select 'اليوم الأول' as day,
       (day_summary(:'branch', :'day1')->>'orders')::int      as "طلبات",
       (day_summary(:'branch', :'day1')->>'revenue')::int     as "الإيراد",
       (day_summary(:'branch', :'day1')->>'cash_sales')::int  as "الكاش",
       (day_summary(:'branch', :'day1')->>'expected_cash')::int as "المتوقّع",
       (day_summary(:'branch', :'day1')->>'actual_cash')::int   as "المعدود",
       (day_summary(:'branch', :'day1')->>'cash_variance')::int as "فرق الدرج"
union all
select 'اليوم الثاني',
       (day_summary(:'branch', :'day2')->>'orders')::int,
       (day_summary(:'branch', :'day2')->>'revenue')::int,
       (day_summary(:'branch', :'day2')->>'cash_sales')::int,
       (day_summary(:'branch', :'day2')->>'expected_cash')::int,
       (day_summary(:'branch', :'day2')->>'actual_cash')::int,
       (day_summary(:'branch', :'day2')->>'cash_variance')::int;

\echo ''
\echo '── فروقات الجرد: هنا يظهر ما لا تراه المبيعات ──'
select business_day, material_name, expected as "المتوقّع", counted as "المعدود",
       variance as "الفرق", variance_pct as "٪",
       equivalent_doses as "≈ جرعة", level as "المستوى"
from v_stock_variance order by created_at, material_name;

\echo ''
\echo '── الهدر في اليومين: نفس البيع تماماً، والهدر قفز من ٣٦غ إلى ٢٣٦غ ──'
select business_day(t.created_at, t.branch_id) as "اليوم",
       -sum(t.qty_delta) as "غرامات الهدر",
       count(*) as "مرات"
from inventory_transactions t
where t.type = 'WASTE' and t.material_id = :'crop'
group by 1 order by 1;

\echo ''
\echo '── لوحة الشاذّ ──'
select kind as "النوع", severity as "الدرجة", detail as "التفصيل"
from v_exceptions order by (severity='high') desc, kind;

\echo ''
\echo '╔════════════════════════════════════════════════════════╗'
\echo '║  الحكم                                                 ║'
\echo '╚════════════════════════════════════════════════════════╝'
select
  case when (select count(*) from v_exceptions
              where at >= (select opened_at from shifts where id=:'sh1')
                and at <= (select closed_at from shifts where id=:'sh1')) = 0
       and (select coalesce(variance,0) from shifts where id=:'sh1') = 0
  then '✅ اليوم الأول: نظيف — لا فرق درج ولا فرق جرد ولا تنبيه'
  else '❌ اليوم الأول: ظهر تنبيه على باريستا أمين (إنذار كاذب)'
  end as "اليوم الأول"
union all
select
  case when (select coalesce(variance,0) from shifts where id=:'sh2') = -5000
  then '✅ اليوم الثاني: كُشف نقص الدرج ٥٬٠٠٠ (ما أخذه من الدرج)'
  else '❌ اليوم الثاني: نقص الدرج لم يُكشف'
  end
union all
select
  case when (select count(*) from v_stock_variance
              where variance < 0 and business_day = :'day2') = 2
  then '✅ اليوم الثاني: كُشف نقص المخزون (المشروبات غير المسجّلة)'
  else '❌ اليوم الثاني: نقص المخزون لم يُكشف'
  end
union all
select
  case when (select -sum(qty_delta) from inventory_transactions
              where type='WASTE' and material_id=:'crop'
                and business_day(created_at, branch_id) = :'day2')
     >= 5 * (select -sum(qty_delta) from inventory_transactions
              where type='WASTE' and material_id=:'crop'
                and business_day(created_at, branch_id) = :'day1')
  then '✅ اليوم الثاني: الهدر الوهمي قفز أضعافاً عن الأمس بنفس البيع'
  else '❌ الهدر الوهمي لم يظهر مقارنةً بالأمس'
  end
union all
-- الاختبار الذي كشف الخلل: هل يُترجَم النقص إلى «مشروبات» أم يبقى نسبة صمّاء؟
select
  case when (select count(*) from v_stock_variance
              where business_day = :'day2' and variance < 0
                and equivalent_doses >= 2 and level = 'over_threshold') = 2
  then '✅ النقص مُترجَم إلى مشروبات كاملة — ولم يختبئ داخل نسبة صغيرة'
  else '❌ مشروب كامل اختبأ داخل نسبة صغيرة (عمود «≈ جرعة» فارغ أو المستوى هادئ)'
  end
union all
-- الهدر الصادق (٣٦غ ≈ جرعتان) صامت، والوهمي (٢٣٦غ ≈ ١٣ جرعة) يصرخ
select
  case when (select count(*) from v_exceptions where kind = 'high_waste') = 1
        and (select detail->>'day' from v_exceptions where kind = 'high_waste') = :'day2'
  then '✅ «هدر عالٍ» أُطلق على اليوم الثاني وحده — واليوم الأمين لم يُتَّهم'
  else '❌ تنبيه الهدر: لم يُطلق، أو أُطلق على اليوم النظيف أيضاً'
  end;
