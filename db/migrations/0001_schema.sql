-- =====================================================================
-- خزف كافيه — المخطّط الأساسي (V1)  ·  حجر الأساس
-- المرجع الوحيد: docs/CAFE-POS-TECH.md (الجزء ١). كل قرار مبنيّ عليه.
--
-- مبادئ مفروضة في القاعدة نفسها (لا في الواجهة):
--   • الفلوس والكميات = أعداد صحيحة  (دينار عراقي كامل · g / ml / pcs).
--   • لا حذف للعمليات المالية/المخزنية — التصحيح بعملية عكسية فقط.
--   • الرصيد الحقيقي = Σ(inventory_transactions.qty_delta) ؛
--     materials.cached_stock مجرّد تسريع، يتغيّر فقط بإدراج حركة.
--   • كل جدول تشغيلي فيه business_id + branch_id (خطاطيف التوسّع لفروع/محلات).
--   • الوقت timestamptz بـUTC من السيرفر · يُعرض بتوقيت بغداد بالواجهة.
-- =====================================================================

begin;

-- إعادة بناء نظيفة: الحالة السابقة بيانات أمثلة فقط (المحل غير مُشغَّل) --
drop table if exists
  redemptions, stamps, customers, waste_log, stock_counts,
  order_items, orders, drink_materials, drinks, materials,
  shifts, employees, audit_log, settings
cascade;

-- جداول هذا المخطّط (لو أُعيد التطبيق) ---------------------------------
drop table if exists
  audit_log, day_closes, cash_movements, stock_count_items, stock_counts,
  inventory_transactions, payments, order_items, orders, order_counters,
  recipe_items, recipes, product_crops, products, materials,
  role_permissions, roles, settings, user_branch_access, users,
  branches, businesses
cascade;

drop type if exists
  user_role, material_unit, order_status, fulfillment_type,
  payment_method, payment_status, inv_txn_type,
  cash_movement_type, shift_status, count_status
cascade;

create extension if not exists pgcrypto;   -- gen_random_uuid()

-- ── الأنواع ──────────────────────────────────────────────────────────
create type user_role         as enum ('owner','barista');
create type material_unit     as enum ('g','ml','pcs');
create type order_status       as enum ('DRAFT','PAID','COMPLETED','VOIDED','REFUNDED');
create type fulfillment_type   as enum ('takeaway','dine_in');
create type payment_method     as enum ('cash','card');
create type payment_status     as enum ('PENDING','CONFIRMED','FAILED');
create type inv_txn_type       as enum ('PURCHASE','SALE','WASTE','STAFF','ADJUSTMENT','COUNT');
create type cash_movement_type as enum ('OPENING','SALE','REFUND','EXPENSE','DROP','REMOVAL');
create type shift_status       as enum ('OPEN','CLOSED');
create type count_status       as enum ('OPEN','COMPLETED');

-- ── businesses / branches ────────────────────────────────────────────
create table businesses (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table branches (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id),
  name           text not null,
  timezone       text not null default 'Asia/Baghdad',
  standard_float integer not null default 0 check (standard_float >= 0),
  pos_locked     boolean not null default false,   -- القفل الطارئ (يدوي فقط)
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index idx_branches_business on branches(business_id);

-- ── users (الموظفون) ─────────────────────────────────────────────────
create table users (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  name         text not null,
  role         user_role not null,
  pin_hash     text not null,                 -- bcrypt — لا PIN صريح أبداً
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index idx_users_business on users(business_id, active);

-- خطّاف: أي فرع يخدم فيه الموظف (الآن الجميع فرع واحد) -----------------
create table user_branch_access (
  user_id    uuid not null references users(id),
  branch_id  uuid not null references branches(id),
  primary key (user_id, branch_id)
);

-- ── الأدوار والصلاحيات (بسيطة الآن، جاهزة للتوسّع) ────────────────────
create table roles (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  key          text not null,          -- owner | barista | (المستقبل)
  name         text not null,
  unique (business_id, key)
);

create table role_permissions (
  role_id     uuid not null references roles(id),
  permission  text not null,           -- sell | void_paid | refund | ...
  primary key (role_id, permission)
);

-- ── materials (المواد: حبوب كل محصول · حليب · أكواب · أغطية) ──────────
create table materials (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id),
  name           text not null,
  base_unit      material_unit not null,
  low_threshold  integer not null default 0 check (low_threshold >= 0),
  current_cost   integer not null default 0 check (current_cost   >= 0), -- دينار/وحدة أساس (متوسط مرجّح)
  cached_stock   integer not null default 0,   -- رصيد مشتَق — لا يُعدَّل مباشرة
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index idx_materials_business on materials(business_id, active);

-- ── products (المشروبات) ─────────────────────────────────────────────
create table products (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id),
  name             text not null,
  category         text not null default 'other',
  active           boolean not null default true,
  paused           boolean not null default false,   -- إيقاف مؤقت
  daily_limit      integer,                            -- كمية يومية (nullable)
  is_daily_special boolean not null default false,
  sort             integer not null default 0,         -- ترتيب شاشة البيع
  created_at       timestamptz not null default now()
);
create index idx_products_business on products(business_id, active);

-- ── product_crops (محاصيل المشروب + سعر كل محصول) ────────────────────
create table product_crops (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id),
  material_id  uuid not null references materials(id),   -- الحبوب
  price        integer not null check (price >= 0),
  available    boolean not null default true,
  unique (product_id, material_id)
);
create index idx_product_crops_product  on product_crops(product_id);
create index idx_product_crops_material on product_crops(material_id);

-- ── recipes / recipe_items (نسخة وصفة لكل مشروب) ─────────────────────
create table recipes (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id),
  version      integer not null default 1,
  coffee_grams integer not null default 0 check (coffee_grams >= 0), -- حبوب المحصول المختار
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  unique (product_id, version)
);
create index idx_recipes_product on recipes(product_id);
-- وصفة فعّالة واحدة لكل مشروب
create unique index uq_recipe_active on recipes(product_id) where active;

create table recipe_items (
  id            uuid primary key default gen_random_uuid(),
  recipe_id     uuid not null references recipes(id),
  material_id   uuid not null references materials(id),  -- حليب/كوب/غطاء… (ليست الحبوب)
  qty           integer not null check (qty > 0),
  only_takeaway boolean not null default false           -- الكوب/الغطاء للسفري فقط
);
create index idx_recipe_items_recipe on recipe_items(recipe_id);

-- ── order_counters (تسلسل ذرّي لرقم الطلب لكل فرع) ───────────────────
create table order_counters (
  branch_id    uuid primary key references branches(id),
  next_number  integer not null default 1001
);

-- ── shifts (الورديات والدرج) ─────────────────────────────────────────
create table shifts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  branch_id       uuid not null references branches(id),
  employee_id     uuid not null references users(id),
  drawer_owner_id uuid references users(id),            -- خطّاف تسليم الدرج
  opening_float   integer not null default 0 check (opening_float >= 0),
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  counted_cash    integer,                               -- عدّ أعمى
  expected_cash   integer,
  variance        integer,
  status          shift_status not null default 'OPEN',
  created_at      timestamptz not null default now()
);
create index idx_shifts_branch on shifts(branch_id, opened_at);
-- منع ورديتين مفتوحتين لنفس الدرج/الفرع
create unique index uq_shift_open_per_branch on shifts(branch_id) where status = 'OPEN';

-- ── customers (خطّاف الولاء — V2) ────────────────────────────────────
create table customers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  phone        text,
  name         text,
  created_at   timestamptz not null default now(),
  unique (business_id, phone)
);

-- ── orders / order_items ─────────────────────────────────────────────
create table orders (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id),
  branch_id     uuid not null references branches(id),
  order_number  integer,                       -- يُسند ذرّياً عند الدفع
  shift_id      uuid references shifts(id),
  employee_id   uuid not null references users(id),
  status        order_status not null default 'DRAFT',
  fulfillment   fulfillment_type not null default 'takeaway',
  is_staff      boolean not null default false, -- مشروب موظف
  subtotal      integer not null default 0 check (subtotal >= 0),
  discount      integer not null default 0 check (discount >= 0),
  total         integer not null default 0 check (total    >= 0),
  customer_id   uuid references customers(id),
  created_at    timestamptz not null default now(),
  paid_at       timestamptz,
  completed_at  timestamptz,
  unique (branch_id, order_number)             -- NULLs متعدّدة مسموحة (DRAFT)
);
create index idx_orders_branch_created on orders(branch_id, created_at);
create index idx_orders_shift  on orders(shift_id);
create index idx_orders_status on orders(status);

create table order_items (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references orders(id),
  product_id       uuid not null references products(id),
  crop_material_id uuid references materials(id),        -- المحصول المختار
  unit_price       integer not null check (unit_price >= 0),  -- مجمّد وقت البيع
  qty              integer not null check (qty > 0),
  recipe_snapshot  jsonb,                                 -- لقطة الوصفة المستهلكة
  is_free          boolean not null default false,
  created_at       timestamptz not null default now()
);
create index idx_order_items_order on order_items(order_id);

-- ── payments (مع منع التكرار على مستوى القاعدة) ──────────────────────
create table payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id),
  method          payment_method not null,
  amount          integer not null check (amount >= 0),
  tendered        integer check (tendered >= 0),          -- المدفوع (كاش)
  change          integer check (change   >= 0),          -- الباقي
  card_reference  text,
  status          payment_status not null default 'PENDING',
  idempotency_key text not null unique,                   -- منع الدفع المكرّر
  created_at      timestamptz not null default now()
);
create index idx_payments_order on payments(order_id);

-- ── inventory_transactions (دفتر حركات المخزون — مصدر الحقيقة) ───────
create table inventory_transactions (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  branch_id       uuid not null references branches(id),
  material_id     uuid not null references materials(id),
  type            inv_txn_type not null,
  qty_delta       integer not null,               -- موجب/سالب بالوحدة الأساس
  unit_cost       integer check (unit_cost >= 0), -- للشراء
  reason          text not null,                  -- لا حركة بلا سبب
  order_id        uuid references orders(id),
  count_id        uuid,                           -- → stock_counts (يُربط أدناه)
  user_id         uuid not null references users(id),
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);
create index idx_inv_material_created on inventory_transactions(material_id, created_at);
create index idx_inv_order            on inventory_transactions(order_id);
create index idx_inv_branch_type      on inventory_transactions(branch_id, type, created_at);

-- ── stock_counts / stock_count_items (الجرد) ─────────────────────────
create table stock_counts (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id),
  user_id     uuid not null references users(id),
  status      count_status not null default 'OPEN',
  created_at  timestamptz not null default now()
);
create index idx_stock_counts_branch on stock_counts(branch_id, created_at);

alter table inventory_transactions
  add constraint fk_inv_count foreign key (count_id) references stock_counts(id);

create table stock_count_items (
  id           uuid primary key default gen_random_uuid(),
  count_id     uuid not null references stock_counts(id),
  material_id  uuid not null references materials(id),
  expected     integer not null,
  counted      integer not null,
  variance     integer not null,
  variance_pct numeric(6,2)
);
create index idx_stock_count_items_count on stock_count_items(count_id);

-- ── cash_movements (حركات الكاش داخل الوردية) ────────────────────────
create table cash_movements (
  id          uuid primary key default gen_random_uuid(),
  shift_id    uuid not null references shifts(id),
  type        cash_movement_type not null,   -- DROP=سحب أثناء · REMOVAL=سحب إغلاق
  amount      integer not null,              -- موجب/سالب
  reason      text,
  user_id     uuid not null references users(id),
  created_at  timestamptz not null default now()
);
create index idx_cash_movements_shift on cash_movements(shift_id, created_at);

-- ── day_closes (إغلاق اليوم المحاسبي) ────────────────────────────────
create table day_closes (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id),
  business_day  date not null,
  closed_by     uuid not null references users(id),
  closed_at     timestamptz not null default now(),
  totals        jsonb,
  unique (branch_id, business_day)
);

-- ── audit_log (سجلّ التدقيق + الموافقات — لا يُمحى) ──────────────────
create table audit_log (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  branch_id    uuid references branches(id),
  user_id      uuid references users(id),          -- الفاعل
  approved_by  uuid references users(id),           -- من وافق
  action       text not null,
  entity_type  text,
  entity_id    uuid,
  before       jsonb,
  after        jsonb,
  reason       text,
  created_at   timestamptz not null default now()
);
create index idx_audit_business_created on audit_log(business_id, created_at);
create index idx_audit_action on audit_log(action);

-- ── settings (business/branch — مفتاح/قيمة) ──────────────────────────
create table settings (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  branch_id    uuid references branches(id),        -- null = على مستوى العمل كله
  key          text not null,
  value        jsonb not null,
  note         text
);
-- تفرّد المفتاح مع/بدون فرع (NULLs متمايزة، فنُقسّم القيد) ------------
create unique index uq_settings_business_key on settings(business_id, key) where branch_id is null;
create unique index uq_settings_branch_key   on settings(business_id, branch_id, key) where branch_id is not null;

commit;
