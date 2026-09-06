-- =====================================================================
-- V2-A — خيارات/إضافات المشروب (Modifiers)
-- المحصول يبقى في product_crops (اختيار مفرد مسعّر). هذه للإضافات الأخرى:
-- الحليب (تبديل مادة) · شوت إضافي (+غرامات المحصول) · سيروب (+مادة).
-- كل خيار: price_delta (± السعر) + أثر مخزني حسب حقوله.
-- =====================================================================

begin;

create table if not exists modifier_groups (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  name         text not null,
  selection    text not null default 'single' check (selection in ('single','multi')),
  required     boolean not null default false,
  sort         integer not null default 0,
  active       boolean not null default true
);

create table if not exists modifier_options (
  id                        uuid primary key default gen_random_uuid(),
  group_id                  uuid not null references modifier_groups(id),
  name                      text not null,
  price_delta               integer not null default 0,
  -- أثر المخزون (اختياري، حسب نوع الخيار):
  material_id               uuid references materials(id),          -- المادة المُضافة/البديلة
  qty                       integer not null default 0 check (qty >= 0), -- كميتها بالوحدة الأساس
  add_to_crop_grams         boolean not null default false,          -- شوت: يضيف qty لغرامات المحصول المختار
  replaces_base_material_id uuid references materials(id),           -- حليب: يستبدل مادة الوصفة الأساسية
  available                 boolean not null default true,
  sort                      integer not null default 0
);
create index if not exists idx_modifier_options_group on modifier_options(group_id);

create table if not exists product_modifier_groups (
  product_id  uuid not null references products(id),
  group_id    uuid not null references modifier_groups(id),
  sort        integer not null default 0,
  primary key (product_id, group_id)
);

-- لقطة الخيارات المختارة وقت البيع (سجلّ دائم للتقارير)
create table if not exists order_item_modifiers (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references order_items(id),
  option_id      uuid references modifier_options(id),
  name           text not null,
  price_delta    integer not null default 0
);
create index if not exists idx_order_item_modifiers_item on order_item_modifiers(order_item_id);

commit;
