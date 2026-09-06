-- =====================================================================
-- 0009 — مصفوفة الصلاحيات v2 (المواصفة §5 · §66)
--
-- المشكلة: الصلاحيات الحالية مفاتيح مسطّحة (sell, refund, …) بلا كتالوج،
-- فلا تستطيع اللوحة عرضها ولا يستطيع المالك تركيب دور جديد.
--
-- الحلّ: كتالوج `permissions` (مفتاح منقّط بنطاق: orders.* / payments.* / …)
-- + إسناد للأدوار في `role_permissions` كما هو (لا تغيير في بنيته).
-- المفاتيح القديمة تبقى مُسندة (aliases) حتى ينتقل كود التطبيق بالكامل —
-- جدول المرادفات في docs/KHAZAF-POS-TECHSPEC.md §6.
--
-- إعادة التطبيق آمنة (idempotent).
-- =====================================================================

-- ── كتالوج الصلاحيات ─────────────────────────────────────────────────
create table if not exists permissions (
  key        text primary key,
  scope      text not null,                 -- orders | payments | cash | inventory | ...
  label      text not null,                 -- اسم عربي للعرض في اللوحة
  sensitive  boolean not null default false,-- يحتاج تأكيداً/موافقة في الواجهة
  legacy_key text                           -- المفتاح المسطّح القديم إن وُجد
);

comment on table permissions is
  'كتالوج الصلاحيات — مصدر القائمة التي يراها المالك عند تركيب الأدوار. لا يُفحص منه مباشرة؛ الفحص من role_permissions.';

insert into permissions (key, scope, label, sensitive, legacy_key) values
  ('orders.create',              'orders',      'إنشاء طلب',                     false, 'sell'),
  ('orders.edit_before_payment', 'orders',      'تعديل الطلب قبل الدفع',          false, null),
  ('orders.view_own',            'orders',      'عرض طلباتي',                    false, null),
  ('orders.view_all',            'orders',      'عرض كل الطلبات',                 false, null),
  ('orders.reprint',             'orders',      'إعادة طباعة الفاتورة',           false, null),
  ('payments.create',            'payments',    'تسجيل الدفع',                   false, 'sell'),
  ('payments.refund',            'payments',    'إرجاع مبلغ',                    true,  'refund'),
  ('payments.void',              'payments',    'إلغاء طلب مدفوع',                true,  'void_paid'),
  ('orders.void_draft',          'orders',      'إلغاء طلب قبل الدفع',            false, 'void_draft'),
  ('discounts.apply',            'discounts',   'خصم عادي',                      false, 'apply_discount'),
  ('discounts.apply_sensitive',  'discounts',   'خصم حسّاس (يتجاوز السقف)',       true,  null),
  ('cash.open_shift',            'cash',        'فتح وردية',                     false, 'open_shift'),
  ('cash.close_shift',           'cash',        'إغلاق وردية',                    false, 'close_shift'),
  ('cash.count',                 'cash',        'إدخال عدّ الدرج',                false, null),
  ('cash.drop',                  'cash',        'سحب نقد أثناء الوردية',          true,  'cash_drop'),
  ('cash.remove',                'cash',        'سحب مبيعات عند الإغلاق',         true,  'cash_removal'),
  ('cash.view_expected',         'cash',        'رؤية النقد المتوقّع والفرق',      true,  null),
  ('cash.no_sale_open',          'cash',        'فتح الدرج بلا بيع',              true,  'no_sale_open'),
  ('cash.handover',              'cash',        'تسليم الدرج',                   false, null),
  ('inventory.view',             'inventory',   'عرض المخزون',                   false, null),
  ('inventory.receive',          'inventory',   'استلام مشتريات',                 false, 'add_stock'),
  ('inventory.count',            'inventory',   'جرد',                          false, 'stock_count'),
  ('inventory.adjust',           'inventory',   'تسوية مخزون',                   true,  'adjust_inventory'),
  ('inventory.waste',            'inventory',   'تسجيل هدر',                     false, 'record_waste'),
  ('staff_drinks.create',        'staff',       'مشروب موظف',                    false, 'staff_drink'),
  ('staff_drinks.approve',       'staff',       'الموافقة على تجاوز حدّ المشروبات', true,  null),
  ('products.manage',            'catalog',     'إدارة المشروبات',                false, 'manage_products'),
  ('recipes.manage',             'catalog',     'إدارة الوصفات',                  false, 'manage_products'),
  ('prices.manage',              'catalog',     'تعديل الأسعار',                  true,  'change_prices'),
  ('loyalty.view_customer',      'loyalty',     'عرض حساب ولاء العميل',           false, null),
  ('loyalty.redeem',             'loyalty',     'صرف مكافأة ولاء',                false, null),
  ('loyalty.manage',             'loyalty',     'إدارة الولاء (إلغاء/تسوية)',      true,  null),
  ('reports.view',               'reports',     'تقارير تشغيلية',                 false, null),
  ('reports.financial',          'reports',     'تقارير مالية',                   true,  'view_reports'),
  ('users.manage',               'admin',       'إدارة الموظفين',                 true,  'manage_staff'),
  ('branches.manage',            'admin',       'إدارة الفروع',                   true,  null),
  ('settings.manage',            'admin',       'الإعدادات',                     true,  'change_settings'),
  ('audit.view',                 'admin',       'سجلّ التدقيق',                   false, null),
  ('day.close',                  'day',         'إغلاق اليوم',                   false, 'day_close'),
  ('day.reopen',                 'day',         'إعادة فتح يوم مُغلق',            true,  'reopen_day'),
  ('pos.lock',                   'admin',       'قفل/فتح الكاشير',                true,  'lock_pos'),
  ('approvals.grant',            'admin',       'منح الموافقات',                  true,  null)
on conflict (key) do update
  set scope = excluded.scope, label = excluded.label,
      sensitive = excluded.sensitive, legacy_key = excluded.legacy_key;

-- ربط role_permissions بالكتالوج بلا كسر الصفوف القديمة:
-- لا نضع مفتاحاً خارجياً لأن المفاتيح القديمة (sell/refund/…) ما زالت مُسندة.
create index if not exists idx_role_permissions_permission on role_permissions (permission);

-- ── إسناد الأدوار ────────────────────────────────────────────────────
-- المالك: كل شيء.
insert into role_permissions (role_id, permission)
select r.id, p.key from roles r cross join permissions p where r.key = 'owner'
on conflict do nothing;

-- الباريستا: تشغيلي فقط (المواصفة §3 — لا مال، لا تقارير، لا كتالوج، لا مخزون).
insert into role_permissions (role_id, permission)
select r.id, k
from roles r
cross join (values
  ('orders.create'), ('orders.edit_before_payment'), ('orders.view_own'),
  ('orders.reprint'), ('orders.void_draft'),
  ('payments.create'),
  ('cash.open_shift'), ('cash.close_shift'), ('cash.count'), ('cash.handover'),
  ('inventory.waste'),
  ('staff_drinks.create'),
  ('loyalty.view_customer'), ('loyalty.redeem')
) as t(k)
where r.key = 'barista'
on conflict do nothing;

-- حارس: الباريستا لا يملك أي صلاحية مالية/إدارية حتى لو أُسندت بالخطأ سابقاً.
delete from role_permissions
where role_id in (select id from roles where key = 'barista')
  and permission in (
    'payments.refund','payments.void','discounts.apply','discounts.apply_sensitive',
    'cash.drop','cash.remove','cash.view_expected','cash.no_sale_open',
    'inventory.view','inventory.receive','inventory.count','inventory.adjust',
    'staff_drinks.approve','products.manage','recipes.manage','prices.manage',
    'loyalty.manage','reports.view','reports.financial','users.manage',
    'branches.manage','settings.manage','audit.view','day.close','day.reopen',
    'pos.lock','approvals.grant','orders.view_all',
    -- المفاتيح المسطّحة القديمة المكافئة
    'refund','void_paid','apply_discount','cash_drop','cash_removal','no_sale_open',
    'add_stock','stock_count','adjust_inventory','purchase','manage_products',
    'change_prices','manage_staff','change_settings','view_reports','day_close',
    'reopen_day','lock_pos','unlock_pos'
  );
