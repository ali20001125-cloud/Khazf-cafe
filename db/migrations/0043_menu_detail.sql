-- =====================================================================
-- 0043 · تفاصيل المشروب في المنيو
--
-- قال المالك: «عند الضغط على مشروب يفتح وتظهر تفاصيله بشكل بسيط، مع
-- معلومات عن القيم الغذائية، وعن القهوة والحليب. بشكل بسيط جداً».
--
-- **القيم تُحسب من الوصفة، ولا تُكتب بيد.**
-- جدولٌ يقول «اللاتيه ١٢٠ سعرة» يكذب في اليوم الذي يُغيَّر فيه الحليب
-- من ١٥٠ مل إلى ١٨٠، ولا أحد يتذكّر أن يُحدّثه. أمّا الحساب من الوصفة
-- فيتغيّر معها في اللحظة نفسها — وهي المصدر الذي يُخصم منه المخزون
-- فعلاً، فلا يمكن أن تتباعد عن الحقيقة.
--
-- ولذلك القيمة تُحفظ على **المادة** لا على المشروب: «الحليب ٠٫٦٤ سعرة
-- لكل مل» حقيقةٌ عن الحليب لا عن اللاتيه، تُكتب مرّةً وتخدم كل مشروبٍ
-- فيه حليب.
-- =====================================================================

-- ── ١) ما تحمله المادة ──────────────────────────────────────────────
alter table materials
  add column if not exists kcal_per_unit        numeric(8,3) not null default 0,
  add column if not exists caffeine_mg_per_unit numeric(8,3) not null default 0,
  add column if not exists menu_note            text;

comment on column materials.kcal_per_unit is
  'سعرات لكل وحدة أساس (غرام/مل/حبة). منها تُحسب سعرات كل مشروب فيه هذه المادة.';
comment on column materials.caffeine_mg_per_unit is
  'كافيين (ملغ) لكل وحدة أساس. للبنّ أساساً — تقديريّ، فالاستخلاص يختلف.';
comment on column materials.menu_note is
  'سطرٌ للزبون عن هذه المادة: «البرازيل · تحميص متوسط · شوكولاتة وبندق» أو «حليب كامل الدسم».';

alter table materials drop constraint if exists materials_nutrition_chk;
alter table materials
  add constraint materials_nutrition_chk
  check (kcal_per_unit >= 0 and caffeine_mg_per_unit >= 0);

-- ── ٢) قيمٌ ابتدائية معقولة ─────────────────────────────────────────
-- مراجع عامّة، لا قياسٌ في مختبر. تُعدَّل متى شاء المالك، والشاشة تقول
-- «تقريبي» فلا تُقرأ كوعدٍ دقيق.
--
-- الحليب كامل الدسم ≈ ٦٤ سعرة/١٠٠ مل · الشوفان ≈ ٤٥ · السيروب ≈ ٣٫١
-- سعرة/مل. والبنّ: حبّةٌ محمّصة ≈ ٢٪ كافيين وزناً، ويُستخلص أكثره في
-- الإسبريسو ⇒ ≈ ٨ ملغ لكل غرام. وسعراته في الكوب تكاد تكون صفراً.
update materials set kcal_per_unit = 0.64 where name = 'حليب'          and kcal_per_unit = 0;
update materials set kcal_per_unit = 0.45 where name = 'حليب شوفان'    and kcal_per_unit = 0;
update materials set kcal_per_unit = 3.10 where name like 'سيروب%'     and kcal_per_unit = 0;
update materials set caffeine_mg_per_unit = 8.0
  where base_unit = 'g' and not is_retail and caffeine_mg_per_unit = 0;

-- ── ٣) تفاصيل المشروب: مكوّناته وقيمه ───────────────────────────────
-- تأخذ المحصول لأن المشروب الواحد يُحضَّر من أنواع بنٍّ مختلفة، ولكلٍّ
-- منها حكايته — وهي ما يُقرأ في مقهىً مختصّ.
create or replace function product_detail(p_product uuid, p_crop uuid)
returns jsonb
language sql stable as $$
  with r as (
    select id, coffee_grams from recipes
    where product_id = p_product and active
    order by version desc limit 1
  ),
  -- البنّ سطرٌ قائم بذاته: كمّيته في `recipes` لا في `recipe_items`
  bean as (
    select m.name, m.menu_note, r.coffee_grams::numeric as qty, m.base_unit,
           r.coffee_grams * m.kcal_per_unit        as kcal,
           r.coffee_grams * m.caffeine_mg_per_unit as caffeine
    from r join materials m on m.id = p_crop
    where r.coffee_grams > 0
  ),
  -- الجلوس لا السفري: الكوب والغطاء لا يُشربان، فلا يدخلان القيم ولا
  -- تُذكر للزبون
  rest as (
    select m.name, m.menu_note, ri.qty::numeric as qty, m.base_unit,
           ri.qty * m.kcal_per_unit        as kcal,
           ri.qty * m.caffeine_mg_per_unit as caffeine
    from r
    join recipe_items ri on ri.recipe_id = r.id and not ri.only_takeaway
    join materials m on m.id = ri.material_id
    where m.base_unit <> 'pcs'
  ),
  all_parts as (select * from bean union all select * from rest)
  select jsonb_build_object(
    'parts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'name', name, 'note', menu_note,
               'qty', round(qty)::int, 'unit', base_unit)
             order by base_unit, name)
      from all_parts), '[]'::jsonb),
    'kcal',     coalesce((select round(sum(kcal))::int     from all_parts), 0),
    'caffeine', coalesce((select round(sum(caffeine))::int from all_parts), 0),
    'known',    exists (select 1 from all_parts)
  );
$$;

comment on function product_detail(uuid, uuid) is
  'مكوّنات المشروب وقيمه، محسوبةً من الوصفة الفعّالة نفسها — لا من جدولٍ يُكتب بيد ويتقادم. الأكواب والأغطية مستثناة: لا تُشرب.';
