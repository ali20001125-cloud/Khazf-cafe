-- =====================================================================
-- بيانات أولية — قابلة للتعديل كلها من لوحة الإدارة
-- الأسعار بالدينار العراقي، بلا كسور.
-- =====================================================================

-- «الأرقام السبعة» + إعدادات التشغيل ----------------------------------
insert into settings (key, value, note) values
  ('currency',            '"د.ع"',  'رمز العملة بالفاتورة'),
  ('shop_name',           '"مقهى خزف"', 'اسم المحل على الفاتورة'),
  ('shop_phone',          '""',     'هاتف المحل على الفاتورة'),
  ('extra_shot_price',    '[500]',  'سعر الشوت الإضافي'),
  ('shot_grams',          '[9]',    'غرامات الشوت الواحد'),
  -- (٢) سقف الأختام للفاتورة الواحدة
  ('stamp_cap_per_order', '[4]',    'المرحلة ٤ — سقف الأختام بالفاتورة'),
  -- (٣) قيمة المشروب المجاني: بحدّ سعر مشروب عادي
  ('free_drink_max_price','[3000]', 'المرحلة ٤ — سقف قيمة المجاني، الفرق يدفعه الزبون'),
  -- (٤) حدّ سرعة الأختام اليومي
  ('stamp_daily_limit',   '[10]',   'المرحلة ٤ — أختام حساب واحد باليوم قبل الإنذار'),
  -- (٥) مدّة انتهاء الأختام
  ('stamp_expiry_days',   '[90]',   'المرحلة ٤ — خمول يسقط الأختام'),
  -- (٦) عتبة إنذار الفرق
  ('variance_alert_pct',  '[3]',    'المرحلة ٢ — فرق% فوقه = تحقيق'),
  ('stamps_for_free',     '[5]',    'المرحلة ٤ — أختام المشروب المجاني')
on conflict (key) do nothing;

-- المواد الخام ---------------------------------------------------------
insert into materials (name, unit, stock, low_alert, is_coffee) values
  ('حبوب الدورادو', 'gram',  5000, 1000, true),
  ('حبوب سيرادو',   'gram',  5000, 1000, true),
  ('حبوب كالدي',    'gram',  5000, 1000, true),
  ('حليب',          'ml',   12000, 3000, false),
  ('كوب سفري',      'piece',  300,   50, false),
  ('غطاء',          'piece',  300,   50, false)
on conflict do nothing;

-- المشروبات ------------------------------------------------------------
-- (٧) «المنيو الأغلى» = التقطير و V60: loyalty_eligible = false
insert into drinks (name, category, price, loyalty_eligible, crop_material_id, sort_order)
select v.name, v.category::drink_category, v.price, v.elig,
       (select id from materials where name = v.crop), v.ord
from (values
  ('إسبريسو',        'espresso', 2000, true,  'حبوب الدورادو', 10),
  ('دبل إسبريسو',    'espresso', 2500, true,  'حبوب الدورادو', 20),
  ('أمريكانو',       'hot',      2500, true,  'حبوب الدورادو', 30),
  ('لاتيه',          'hot',      3000, true,  'حبوب الدورادو', 40),
  ('كابتشينو',       'hot',      3000, true,  'حبوب الدورادو', 50),
  ('فلات وايت',      'hot',      3000, true,  'حبوب الدورادو', 60),
  ('موكا',           'hot',      3500, true,  'حبوب الدورادو', 70),
  ('آيس لاتيه',      'cold',     3500, true,  'حبوب الدورادو', 80),
  ('آيس أمريكانو',   'cold',     3000, true,  'حبوب الدورادو', 90),
  ('في٦٠',           'other',    5000, false, 'حبوب سيرادو',  100),
  ('تقطير',          'other',    5000, false, 'حبوب كالدي',   110)
) as v(name, category, price, elig, crop, ord)
on conflict do nothing;

-- الوصفات --------------------------------------------------------------
-- ملاحظة: مل الحليب لكل مشروب قابل للتعديل من لوحة الوصفات.
insert into drink_materials (drink_id, material_id, qty, takeaway_only)
select d.id, m.id, v.qty, v.takeaway
from (values
  ('إسبريسو',      'حبوب الدورادو',  9,   false),
  ('دبل إسبريسو',  'حبوب الدورادو', 18,   false),
  ('أمريكانو',     'حبوب الدورادو', 18,   false),
  ('لاتيه',        'حبوب الدورادو', 18,   false),
  ('لاتيه',        'حليب',         180,   false),
  ('كابتشينو',     'حبوب الدورادو', 18,   false),
  ('كابتشينو',     'حليب',         150,   false),
  ('فلات وايت',    'حبوب الدورادو', 18,   false),
  ('فلات وايت',    'حليب',         150,   false),
  ('موكا',         'حبوب الدورادو', 18,   false),
  ('موكا',         'حليب',         180,   false),
  ('آيس لاتيه',    'حبوب الدورادو', 18,   false),
  ('آيس لاتيه',    'حليب',         200,   false),
  ('آيس أمريكانو', 'حبوب الدورادو', 18,   false),
  ('في٦٠',         'حبوب سيرادو',  20,   false),
  ('تقطير',        'حبوب كالدي',   20,   false)
) as v(drink, material, qty, takeaway)
join drinks d on d.name = v.drink
join materials m on m.name = v.material
on conflict do nothing;

-- الكوب والغطاء لكل مشروب سفري ----------------------------------------
insert into drink_materials (drink_id, material_id, qty, takeaway_only)
select d.id, m.id, 1, true
from drinks d
cross join materials m
where m.name in ('كوب سفري', 'غطاء')
on conflict do nothing;
