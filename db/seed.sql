-- =====================================================================
-- خزف كافيه — بيانات أوّلية (Seed)  ·  قابلة للتعديل كلها من اللوحة
-- الأسعار بالدينار العراقي، أعداد صحيحة. الكميات بالوحدة الأساس (g/ml/pcs).
-- المخزون الابتدائي يدخل عبر الدفتر (PURCHASE) ثم يُحدَّث cached_stock منه —
-- التزاماً بمبدأ «الرصيد من الحركات فقط».
-- =====================================================================

begin;

-- ── العمل والفرع ─────────────────────────────────────────────────────
insert into businesses (name) values ('مقهى خزف');

insert into branches (business_id, name, standard_float)
select id, 'الفرع الرئيسي', 50000 from businesses;

insert into order_counters (branch_id)
select id from branches;

-- ── الأدوار والصلاحيات ───────────────────────────────────────────────
insert into roles (business_id, key, name)
select id, 'owner', 'المالك' from businesses;
insert into roles (business_id, key, name)
select id, 'barista', 'الباريستا' from businesses;

-- المالك: كل الصلاحيات
insert into role_permissions (role_id, permission)
select r.id, p.perm
from roles r
cross join (values
  ('sell'),('open_shift'),('close_shift'),('record_waste'),('staff_drink'),
  ('no_sale_open'),('void_draft'),('void_paid'),('refund'),('apply_discount'),
  ('adjust_inventory'),('stock_count'),('add_stock'),('purchase'),
  ('change_prices'),('manage_products'),('manage_staff'),('change_settings'),
  ('view_reports'),('cash_drop'),('cash_removal'),('lock_pos'),('unlock_pos'),
  ('day_close'),('reopen_day')
) as p(perm)
where r.key = 'owner';

-- الباريستا: البيع والتشغيل اليومي فقط (الباقي يحتاج موافقة المالك)
insert into role_permissions (role_id, permission)
select r.id, p.perm
from roles r
cross join (values
  ('sell'),('open_shift'),('close_shift'),('record_waste'),('staff_drink'),
  ('no_sale_open'),('void_draft'),('cash_drop'),('day_close')
) as p(perm)
where r.key = 'barista';

-- ── المستخدمون (PIN مُهشّر bcrypt عبر pgcrypto) ──────────────────────
-- أرقام دخول ابتدائية تُغيَّر فوراً من اللوحة: المالك 4917 · الباريستا 2603
insert into users (business_id, name, role, pin_hash)
select id, 'المالك', 'owner', crypt('4917', gen_salt('bf')) from businesses;
insert into users (business_id, name, role, pin_hash)
select id, 'الباريستا', 'barista', crypt('2603', gen_salt('bf')) from businesses;

insert into user_branch_access (user_id, branch_id)
select u.id, b.id from users u cross join branches b;

-- ── المواد الخام ─────────────────────────────────────────────────────
-- current_cost = دينار لكل وحدة أساس (تقديري، يُصحَّح مع أول شراء حقيقي).
insert into materials (business_id, name, base_unit, low_threshold, current_cost)
select bs.id, m.name, m.unit::material_unit, m.low, m.cost
from businesses bs
cross join (values
  ('حبوب الدورادو', 'g',   1000, 25),
  ('حبوب سيرادو',   'g',   1000, 30),
  ('حبوب كالدي',    'g',   1000, 30),
  ('حليب',          'ml',  3000,  2),
  ('كوب سفري',      'pcs',   50, 250),
  ('غطاء',          'pcs',   50, 100)
) as m(name, unit, low, cost);

-- ── المشروبات ────────────────────────────────────────────────────────
-- «المنيو الأغلى» (في٦٠/تقطير) ليس بعد ضمن الولاء (يُضبط لاحقاً في V2).
insert into products (business_id, name, category, sort)
select bs.id, p.name, p.cat, p.sort
from businesses bs
cross join (values
  ('إسبريسو',      'espresso', 10),
  ('دبل إسبريسو',  'espresso', 20),
  ('أمريكانو',     'hot',      30),
  ('لاتيه',        'hot',      40),
  ('كابتشينو',     'hot',      50),
  ('فلات وايت',    'hot',      60),
  ('موكا',         'hot',      70),
  ('آيس لاتيه',    'cold',     80),
  ('آيس أمريكانو', 'cold',     90),
  ('في٦٠',         'filter',  100),
  ('تقطير',        'filter',  110)
) as p(name, cat, sort);

-- ── محاصيل المشروب + السعر لكل محصول ─────────────────────────────────
insert into product_crops (product_id, material_id, price)
select d.id, m.id, v.price
from (values
  ('إسبريسو',      'حبوب الدورادو', 2000),
  ('دبل إسبريسو',  'حبوب الدورادو', 2500),
  ('أمريكانو',     'حبوب الدورادو', 2500),
  ('لاتيه',        'حبوب الدورادو', 3000),
  ('كابتشينو',     'حبوب الدورادو', 3000),
  ('فلات وايت',    'حبوب الدورادو', 3000),
  ('موكا',         'حبوب الدورادو', 3500),
  ('آيس لاتيه',    'حبوب الدورادو', 3500),
  ('آيس أمريكانو', 'حبوب الدورادو', 3000),
  ('في٦٠',         'حبوب سيرادو',   5000),
  ('تقطير',        'حبوب كالدي',    5000)
) as v(drink, crop, price)
join products  d on d.name = v.drink
join materials m on m.name = v.crop;

-- ── الوصفات (حبوب المحصول على مستوى الوصفة) ─────────────────────────
insert into recipes (product_id, version, coffee_grams)
select d.id, 1, v.grams
from (values
  ('إسبريسو',       9),
  ('دبل إسبريسو',  18),
  ('أمريكانو',     18),
  ('لاتيه',        18),
  ('كابتشينو',     18),
  ('فلات وايت',    18),
  ('موكا',         18),
  ('آيس لاتيه',    18),
  ('آيس أمريكانو', 18),
  ('في٦٠',         20),
  ('تقطير',        20)
) as v(drink, grams)
join products d on d.name = v.drink;

-- الحليب (مواد وصفة غير الحبوب) --------------------------------------
insert into recipe_items (recipe_id, material_id, qty, only_takeaway)
select r.id, m.id, v.ml, false
from (values
  ('لاتيه',      180),
  ('كابتشينو',   150),
  ('فلات وايت',  150),
  ('موكا',       180),
  ('آيس لاتيه',  200)
) as v(drink, ml)
join products d on d.name = v.drink
join recipes  r on r.product_id = d.id and r.active
join materials m on m.name = 'حليب';

-- الكوب والغطاء لكل مشروب — للسفري فقط -------------------------------
insert into recipe_items (recipe_id, material_id, qty, only_takeaway)
select r.id, m.id, 1, true
from recipes r
join materials m on m.name in ('كوب سفري', 'غطاء')
where r.active;

-- ── الإعدادات (على مستوى العمل — branch_id = null) ──────────────────
insert into settings (business_id, key, value, note)
select bs.id, s.key, s.val::jsonb, s.note
from businesses bs
cross join (values
  ('currency',                '"IQD"',                  'العملة'),
  ('shop_name',               '"مقهى خزف"',              'اسم المحل على الفاتورة'),
  ('shop_phone',              '""',                      'هاتف المحل على الفاتورة'),
  ('staff_drink_limit',       '1',                       'مشروبات الموظف المجانية باليوم قبل الموافقة'),
  ('variance_thresholds',     '{"green":3,"amber":5}',   'عتبات فرق المخزون% (أخضر/أصفر/أحمر فوقها)'),
  ('session_timeout_minutes', '10',                      'قفل تلقائي بعد خمول'),
  ('standard_float',          '50000',                   'الفكّة الافتتاحية القياسية'),
  ('extra_shot_price',        '500',                     'سعر الشوت الإضافي'),
  ('shot_grams',              '9',                       'غرامات الشوت الواحد'),
  ('low_stock_alert',         'true',                    'تنبيه المخزون المنخفض')
) as s(key, val, note);

-- ── المخزون الابتدائي عبر الدفتر (PURCHASE) ثم تحديث cached_stock ────
insert into inventory_transactions
  (business_id, branch_id, material_id, type, qty_delta, unit_cost, reason, user_id)
select m.business_id, br.id, m.id, 'PURCHASE', v.qty, m.current_cost, 'رصيد افتتاحي', u.id
from (values
  ('حبوب الدورادو', 5000),
  ('حبوب سيرادو',   5000),
  ('حبوب كالدي',    5000),
  ('حليب',         12000),
  ('كوب سفري',       300),
  ('غطاء',           300)
) as v(name, qty)
join materials m on m.name = v.name
join branches  br on br.business_id = m.business_id
join users     u on u.business_id = m.business_id and u.role = 'owner';

-- cached_stock مشتَق من الدفتر (لا يُدخَل يدوياً) ---------------------
update materials m
set cached_stock = t.total
from (
  select material_id, sum(qty_delta) as total
  from inventory_transactions group by material_id
) t
where t.material_id = m.id;

commit;
