-- تصفير بين الاختبارات: كل سكربت يفترض مقهى بلا وردية مفتوحة ولا حركة.
-- المنتجات والمواد والمستخدمون (من seed.sql) تبقى كما هي.
truncate loyalty_ledger, loyalty_rewards, loyalty_accounts, otp_codes,
         order_item_modifiers, order_discounts, refund_items, refunds, order_voids,
         payments, order_items, inventory_transactions, cash_movements, orders,
         shifts, customers, audit_log, stock_count_items, stock_counts,
         no_sale_opens, drawer_handovers, day_closes
restart identity cascade;
update order_counters set next_number = 1001;

-- `truncate` لا يُشغّل مُشغّلات الصفوف، فيبقى `cached_stock` معلّقاً بلا دفتر.
-- تصفيره يدوياً يرفضه الحارس (وهذا صحيح — الرصيد يُشتقّ من الدفتر)، فنوقف
-- المُشغّلات هنا وحدها. هذا تصفير أدوات اختبار، لا مسار يمرّ به التطبيق.
set session_replication_role = replica;
update materials set cached_stock = 0;
set session_replication_role = origin;

-- مواد ومنتجات أنشأتها اختبارات سابقة (09_new_product) تتراكم وتُشوّش القراءة.
-- حذفها آمن هنا: دفتر المخزون فُرّغ للتوّ، فلا حركة معلّقة عليها.
delete from recipe_items where recipe_id in (
  select r.id from recipes r join products p on p.id = r.product_id where p.name like '%اختبار%');
delete from recipes where product_id in (select id from products where name like '%اختبار%');
delete from product_crops where product_id in (select id from products where name like '%اختبار%')
   or material_id in (select id from materials where name like '%اختبار%');
delete from price_history where product_id in (select id from products where name like '%اختبار%')
   or material_id in (select id from materials where name like '%اختبار%');
delete from products where name like '%اختبار%';
delete from materials where name like '%اختبار%';

-- نسخ الوصفات التي صنعها 19_recipe_versions تتراكم بين التشغيلات، فتقرأ
-- الاختبارات التالية وصفةً غير التي زرعها `seed`. نُعيد الأولى فعّالةً
-- ونحذف ما بعدها — التاريخ هنا أثرُ اختبارٍ لا أثرُ عمل.
delete from recipe_items where recipe_id in (select id from recipes where version > 1);
delete from recipes where version > 1;
update recipes set active = true where version = 1 and not active;
-- و19 يُوقف محصولاً ليُثبت أن الإيقاف لا يحذف. إعادته متاحاً تُعيد الكتالوج
-- لما زرعه `seed`، وإلا قرأ ما بعده كتالوجاً ناقصاً بلا سبب.
update product_crops set available = true where not available;

-- 25_menu يُخفي منتجاً من المنيو ويوقف آخر ويكتب سطراً تحته. هذه رايات
-- عرضٍ على `products` لا يمسّها `truncate`، فتبقى بعد التصفير ويقرأ ما
-- بعدها كتالوجاً غير الذي زرعه `seed`.
update products set menu_visible = true where not menu_visible;
update products set menu_note = null where menu_note is not null;
update products set paused = false where paused;
update products set image_url = null where image_url is not null;
update products set is_daily_special = false where is_daily_special;
update materials set menu_note = null where menu_note is not null;

-- وحدات الشراء التي ينشئها 17 تتراكم بين التشغيلات فتظهر مكرّرةً في الشاشة
-- (وهذا ما كشف غياب قيد الاسم الفريد — هجرة 0034).
delete from material_units;
