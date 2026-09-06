-- =====================================================================
-- 0012 — الطلبات v2: نوع الطلب · تاريخ الأسعار · الخصومات · الإلغاء · الإرجاع
-- المرجع: المواصفة §8 · §42 · §48 · §49 · §50 · §58
--
-- المبدأ: **لا حذف ولا تعديل تاريخ.** الخصم سجلّ مستقلّ (لا تعديل سعر)،
-- والإلغاء والإرجاع وثيقتان تُضافان فوق الطلب الأصلي الذي يبقى كما هو.
-- =====================================================================

do $$ begin
  create type order_type as enum ('SALE', 'LOYALTY_REWARD', 'STAFF_DRINK', 'COMPLIMENTARY');
exception when duplicate_object then null; end $$;

do $$ begin
  create type refund_status as enum ('PENDING', 'APPROVED', 'REJECTED', 'COMPLETED');
exception when duplicate_object then null; end $$;

do $$ begin
  create type discount_kind as enum ('PERCENT', 'AMOUNT', 'COMP');
exception when duplicate_object then null; end $$;

-- ── نوع الطلب (§42) ──────────────────────────────────────────────────
alter table orders add column if not exists order_type order_type not null default 'SALE';
update orders set order_type = 'STAFF_DRINK' where is_staff and order_type = 'SALE';

comment on column orders.is_staff is 'مهجور — استُبدل بـ order_type = STAFF_DRINK. يبقى للتوافق الرجعي.';

-- طلب المكافأة إجماليه صفر ولا يفتح الدرج (§43).
alter table orders drop constraint if exists orders_reward_zero_total;
alter table orders add constraint orders_reward_zero_total
  check (order_type <> 'LOYALTY_REWARD' or total = 0);

create index if not exists idx_orders_type on orders (branch_id, order_type, created_at);
create index if not exists idx_orders_customer on orders (customer_id) where customer_id is not null;

-- =====================================================================
-- §8 — تاريخ الأسعار: الطلبات القديمة تبقى بسعرها، والتغيير مُوثّق
-- =====================================================================
create table if not exists price_history (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id),
  product_id    uuid not null references products(id),
  material_id   uuid not null references materials(id),      -- المحصول
  old_price     integer,
  new_price     integer not null check (new_price >= 0),
  changed_by    uuid references users(id),
  reason        text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_price_history_product on price_history (product_id, created_at desc);

comment on table price_history is
  'سجلّ تغيّر سعر (مشروب × محصول). الطلب يأخذ لقطة سعره في order_items.unit_price — هذا للتدقيق والتقارير.';

-- الفاعل يأتي من التطبيق: set_config(''khazaf.actor'', <user_id>, true) قبل التعديل.
create or replace function khazaf_price_history() returns trigger
language plpgsql as $$
declare v_actor uuid;
        v_business uuid;
begin
  begin
    v_actor := nullif(current_setting('khazaf.actor', true), '')::uuid;
  exception when others then v_actor := null;
  end;
  select business_id into v_business from products where id = new.product_id;
  insert into price_history (business_id, product_id, material_id, old_price, new_price, changed_by, reason)
  values (v_business, new.product_id, new.material_id,
          case when tg_op = 'UPDATE' then old.price end, new.price, v_actor,
          nullif(current_setting('khazaf.reason', true), ''));
  return null;
end;
$$;

-- مُشغّلان منفصلان: شرط WHEN لا يرى OLD في INSERT.
drop trigger if exists product_crops_price_history on product_crops;
drop trigger if exists product_crops_price_history_ins on product_crops;
create trigger product_crops_price_history_ins
  after insert on product_crops
  for each row execute function khazaf_price_history();

drop trigger if exists product_crops_price_history_upd on product_crops;
create trigger product_crops_price_history_upd
  after update of price on product_crops
  for each row when (old.price is distinct from new.price)
  execute function khazaf_price_history();

-- تعبئة أوّلية: السعر الحالي كنقطة بداية للتاريخ.
insert into price_history (business_id, product_id, material_id, old_price, new_price, reason)
select p.business_id, pc.product_id, pc.material_id, null, pc.price, 'رصيد افتتاحي للتاريخ'
from product_crops pc join products p on p.id = pc.product_id
where not exists (select 1 from price_history h
                  where h.product_id = pc.product_id and h.material_id = pc.material_id);

-- =====================================================================
-- §48 — الخصومات: سجلّ، لا تعديل سعر
-- =====================================================================
create table if not exists order_discounts (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id),
  order_item_id  uuid references order_items(id),            -- null = خصم على الفاتورة كلها
  kind           discount_kind not null,
  value          integer not null check (value >= 0),        -- نسبة (0–100) أو مبلغ
  amount         integer not null check (amount >= 0),       -- المبلغ المحسوب فعلياً
  original_total integer not null check (original_total >= 0),
  final_total    integer not null check (final_total >= 0),
  reason         text not null,
  applied_by     uuid not null references users(id),
  approved_by    uuid references users(id),
  created_at     timestamptz not null default now(),
  constraint order_discounts_percent_range check (kind <> 'PERCENT' or value between 0 and 100),
  constraint order_discounts_math check (final_total = original_total - amount)
);
create index if not exists idx_order_discounts_order on order_discounts (order_id);

comment on table order_discounts is
  'المواصفة §48: الخصم ليس تعديلاً للسعر. يُخزَّن الأصل والخصم والنهائي والسبب والفاعل والموافِق.';

-- =====================================================================
-- §49 — الإلغاء بعد الدفع: وثيقة، والطلب الأصلي يبقى
-- =====================================================================
create table if not exists order_voids (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null unique references orders(id),
  reason      text not null,
  voided_by   uuid not null references users(id),
  approved_by uuid references users(id),
  created_at  timestamptz not null default now()
);

comment on table order_voids is
  'المواصفة §49: لا Delete Order بعد الدفع — Void بسبب وفاعل وموافقة ووقت.';

-- =====================================================================
-- §50 — الإرجاع: لا يحذف البيع، ولا يُرجع مواد الكافيه للمخزون
-- =====================================================================
create table if not exists refunds (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id),
  branch_id      uuid not null references branches(id),
  order_id       uuid not null references orders(id),
  shift_id       uuid references shifts(id),
  amount         integer not null check (amount > 0),
  method         payment_method not null,
  reason         text not null,
  requested_by   uuid not null references users(id),
  approved_by    uuid references users(id),
  status         refund_status not null default 'PENDING',
  idempotency_key text not null unique,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);
create index if not exists idx_refunds_order on refunds (order_id);
create index if not exists idx_refunds_branch_created on refunds (branch_id, created_at);

create table if not exists refund_items (
  id            uuid primary key default gen_random_uuid(),
  refund_id     uuid not null references refunds(id),
  order_item_id uuid not null references order_items(id),
  qty           integer not null check (qty > 0),
  amount        integer not null check (amount >= 0),
  unique (refund_id, order_item_id)
);
create index if not exists idx_refund_items_refund on refund_items (refund_id);

comment on table refunds is
  'المواصفة §50: الإرجاع لا يحذف البيع. مشروبات الكافيه لا تعود للمخزون (استُهلكت).';

-- القيد الذهبي: مجموع الإرجاعات المكتملة ≤ المدفوع فعلاً (§58).
create or replace function khazaf_refund_cap() returns trigger
language plpgsql as $$
declare
  v_paid   integer;
  v_already integer;
begin
  if new.status <> 'COMPLETED' then return new; end if;

  select coalesce(sum(amount), 0) into v_paid
    from payments where order_id = new.order_id and status = 'CONFIRMED';

  select coalesce(sum(amount), 0) into v_already
    from refunds where order_id = new.order_id and status = 'COMPLETED' and id <> new.id;

  if v_already + new.amount > v_paid then
    raise exception 'الإرجاع (%) يتجاوز المدفوع (%) بعد إرجاعات سابقة (%) — المواصفة §58',
      new.amount, v_paid, v_already using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists refunds_cap on refunds;
create trigger refunds_cap
  before insert or update on refunds
  for each row execute function khazaf_refund_cap();

-- الإرجاع المكتمل ينقل الطلب إلى REFUNDED (كامل) أو PARTIALLY_REFUNDED (جزئي).
create or replace function khazaf_refund_sync_order() returns trigger
language plpgsql as $$
declare
  v_paid  integer;
  v_total integer;
begin
  if new.status <> 'COMPLETED' then return null; end if;

  select coalesce(sum(amount), 0) into v_paid
    from payments where order_id = new.order_id and status = 'CONFIRMED';
  select coalesce(sum(amount), 0) into v_total
    from refunds where order_id = new.order_id and status = 'COMPLETED';

  update orders
     set status = (case when v_total >= v_paid then 'REFUNDED' else 'PARTIALLY_REFUNDED' end)::order_status
   where id = new.order_id;

  if new.method = 'cash' and new.shift_id is not null then
    insert into cash_movements (shift_id, type, amount, reason, user_id)
    values (new.shift_id, 'REFUND', -new.amount, coalesce(new.reason, 'إرجاع'), new.requested_by);
  end if;
  return null;
end;
$$;

drop trigger if exists refunds_sync_order on refunds;
create trigger refunds_sync_order
  after insert or update on refunds
  for each row execute function khazaf_refund_sync_order();
