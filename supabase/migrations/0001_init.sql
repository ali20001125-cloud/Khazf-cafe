-- =====================================================================
-- كاشير خزف — مخطّط قاعدة البيانات (الأساس)
-- المرحلة ١ تستعمل: materials, drinks, drink_materials, orders,
-- order_items, settings, counters. بقية الجداول موضوعة من الآن
-- حتى لا نكسر المخطّط بالمراحل اللاحقة.
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- الإعدادات: «الأرقام السبعة» وغيرها — تُعدَّل بلا نشر كود
-- ---------------------------------------------------------------------
create table if not exists settings (
  key         text primary key,
  value       jsonb not null,
  note        text,
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- المواد الخام
-- ---------------------------------------------------------------------
do $$ begin
  create type material_unit as enum ('gram', 'ml', 'piece');
exception when duplicate_object then null; end $$;

create table if not exists materials (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  unit        material_unit not null,
  stock       numeric(12,3) not null default 0,   -- بوحدة الحساب
  low_alert   numeric(12,3) not null default 0,   -- تنبيه انخفاض
  is_coffee   boolean not null default false,     -- حبوب؟ (لربط المحصول)
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists materials_name_uniq on materials (lower(name));

-- ---------------------------------------------------------------------
-- المشروبات
-- ---------------------------------------------------------------------
do $$ begin
  create type drink_category as enum ('hot', 'cold', 'espresso', 'other');
exception when duplicate_object then null; end $$;

create table if not exists drinks (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  category       drink_category not null default 'hot',
  price          integer not null check (price >= 0),   -- دينار، بلا كسور
  loyalty_eligible boolean not null default true,        -- منيو أغلى = false
  crop_material_id uuid references materials(id) on delete set null, -- المحصول
  sort_order     integer not null default 100,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create unique index if not exists drinks_name_uniq on drinks (lower(name));

-- ---------------------------------------------------------------------
-- الوصفة: مشروب ← مواد
-- ---------------------------------------------------------------------
create table if not exists drink_materials (
  drink_id     uuid not null references drinks(id) on delete cascade,
  material_id  uuid not null references materials(id) on delete restrict,
  qty          numeric(12,3) not null check (qty > 0),
  takeaway_only boolean not null default false,  -- كوب/غطاء: للسفري فقط
  primary key (drink_id, material_id)
);

-- ---------------------------------------------------------------------
-- الموظفون والورديات (المرحلة ٣ — الهيكل من الآن)
-- ---------------------------------------------------------------------
do $$ begin
  create type employee_role as enum ('owner', 'barista');
exception when duplicate_object then null; end $$;

create table if not exists employees (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  pin_hash    text,
  role        employee_role not null default 'barista',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists shifts (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid references employees(id) on delete set null,
  opened_at      timestamptz not null default now(),
  closed_at      timestamptz,
  opening_float  integer not null default 0,
  counted_cash   integer,          -- عدّ أعمى
  expected_cash  integer,          -- يُحسب عند الإغلاق
  variance       integer generated always as (counted_cash - expected_cash) stored
);

-- ---------------------------------------------------------------------
-- الطلبات
-- ---------------------------------------------------------------------
do $$ begin
  create type order_status as enum ('open', 'paid', 'voided');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payment_method as enum ('cash', 'card');
exception when duplicate_object then null; end $$;

do $$ begin
  create type service_type as enum ('takeaway', 'dinein');
exception when duplicate_object then null; end $$;

create sequence if not exists order_number_seq start 1;

create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  number        bigint not null default nextval('order_number_seq'),
  shift_id      uuid references shifts(id) on delete set null,
  employee_id   uuid references employees(id) on delete set null,
  customer_id   uuid,
  status        order_status not null default 'open',
  payment_method payment_method,
  service       service_type not null default 'takeaway',
  total         integer not null default 0,
  cash_received integer,
  change_due    integer,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);
create unique index if not exists orders_number_uniq on orders (number);
create index if not exists orders_created_idx on orders (created_at desc);

create table if not exists order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  drink_id    uuid not null references drinks(id) on delete restrict,
  drink_name  text not null,          -- لقطة الاسم وقت البيع
  qty         integer not null check (qty > 0),
  unit_price  integer not null check (unit_price >= 0),
  is_free     boolean not null default false,
  free_reason text,
  service     service_type not null default 'takeaway',
  extra_shots integer not null default 0 check (extra_shots >= 0),
  note        text
);
create index if not exists order_items_order_idx on order_items (order_id);

-- ---------------------------------------------------------------------
-- الهدر / التدقيق / الجرد (المراحل ٢–٣ — الهيكل من الآن)
-- ---------------------------------------------------------------------
do $$ begin
  create type waste_reason as enum ('dial_in', 'spill', 'expired', 'remake');
exception when duplicate_object then null; end $$;

create table if not exists waste_log (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id) on delete restrict,
  qty         numeric(12,3) not null check (qty > 0),
  reason      waste_reason not null,
  employee_id uuid references employees(id) on delete set null,
  note        text,
  created_at  timestamptz not null default now()
);

create table if not exists audit_log (
  id           uuid primary key default gen_random_uuid(),
  event        text not null,   -- void | refund | discount | free | no_sale | price_edit | stamp_adjust | recipe_edit ...
  employee_id  uuid references employees(id) on delete set null,
  approved_by  uuid references employees(id) on delete set null,
  order_id     uuid references orders(id) on delete set null,
  amount       integer,
  reason       text,
  meta         jsonb,
  created_at   timestamptz not null default now()
);
create index if not exists audit_log_created_idx on audit_log (created_at desc);

create table if not exists stock_counts (
  id           uuid primary key default gen_random_uuid(),
  material_id  uuid not null references materials(id) on delete cascade,
  expected     numeric(12,3) not null,
  counted      numeric(12,3) not null,
  variance_pct numeric(6,2),
  employee_id  uuid references employees(id) on delete set null,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- الولاء (المرحلة ٤ — الهيكل من الآن)
-- ---------------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null unique,
  name        text,
  token       text not null unique default encode(gen_random_bytes(12), 'hex'),
  created_at  timestamptz not null default now()
);

create table if not exists stamps (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists stamps_customer_idx on stamps (customer_id, created_at desc);

create table if not exists redemptions (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers(id) on delete cascade,
  order_id    uuid not null references orders(id) on delete cascade,
  created_at  timestamptz not null default now()
);

do $$ begin
  alter table orders
    add constraint orders_customer_fk
    foreign key (customer_id) references customers(id) on delete set null;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- الأمان: RLS مقفلة بالكامل. لا سياسات عامة.
-- كل الوصول عبر خادم Next.js بمفتاح service_role.
-- مفتاح anon لا يقرأ ولا يكتب أي شيء.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'settings','materials','drinks','drink_materials','employees','shifts',
    'orders','order_items','waste_log','audit_log','stock_counts',
    'customers','stamps','redemptions'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
  end loop;
end $$;
