-- =====================================================================
-- 0014 — الولاء الإلكتروني بالكامل (المواصفة §37–§47)
--
-- القواعد المفروضة في القاعدة:
--   • الباريستا لا يُنشئ حساباً ولا يعدّل رصيداً — التسجيل ذاتي بـOTP (§37/§38).
--   • الرصيد **مشتقّ من دفتر الولاء**، لا عمود قابل للتعديل (§46).
--   • +1 لكل مشروب مؤهَّل مدفوع (§39)؛ لا كسب من مكافأة/موظف/هدر/ملغى/مُرجَع (§40).
--   • عند اكتمال العتبة تُنشأ المكافأة **تلقائياً** (§41) — لا إنشاء يدوي.
--   • المكافأة تُصرف مرّة واحدة فقط (§45) — قيد فريد + آلة حالة.
--   • الإرجاع يعكس الكسب بحركة معاكسة، ولا يُعدَّل التاريخ (§47).
-- =====================================================================

do $$ begin
  create type loyalty_ledger_type as enum (
    'EARN', 'EARN_REVERSAL', 'REWARD_ISSUED', 'REWARD_REDEEMED',
    'REWARD_CANCELLED', 'ADJUSTMENT'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type reward_status as enum ('AVAILABLE', 'REDEEMED', 'CANCELLED', 'EXPIRED');
exception when duplicate_object then null; end $$;

-- ── العميل: التحقّق ذاتي بالواتساب (§37) ────────────────────────────
alter table customers add column if not exists phone_verified_at timestamptz;
alter table customers add column if not exists source text not null default 'self_signup';
alter table customers add column if not exists blocked boolean not null default false;

alter table customers drop constraint if exists customers_phone_required;
alter table customers add constraint customers_phone_required check (phone is not null and phone <> '');

-- ── رموز التحقّق (OTP) ───────────────────────────────────────────────
create table if not exists otp_codes (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  phone       text not null,
  code_hash   text not null,                     -- bcrypt — لا رمز صريح أبداً
  attempts    integer not null default 0 check (attempts >= 0),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists idx_otp_phone on otp_codes (business_id, phone, created_at desc);
create unique index if not exists uq_otp_active
  on otp_codes (business_id, phone) where consumed_at is null;

comment on table otp_codes is
  'رموز تحقّق الواتساب للتسجيل الذاتي (§37). مُهشّرة، لها مهلة وعدّاد محاولات. لا تُقرأ من واجهة الكاشير.';

-- ── حساب الولاء ──────────────────────────────────────────────────────
create table if not exists loyalty_accounts (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  customer_id uuid not null unique references customers(id),
  status      text not null default 'ACTIVE' check (status in ('ACTIVE','BLOCKED')),
  created_at  timestamptz not null default now()
);
create index if not exists idx_loyalty_accounts_business on loyalty_accounts (business_id);

-- ── دفتر الولاء (§46) — للإلحاق فقط، والرصيد مجموعه ─────────────────
create table if not exists loyalty_ledger (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  account_id      uuid not null references loyalty_accounts(id),
  type            loyalty_ledger_type not null,
  stamps_delta    integer not null,
  order_id        uuid references orders(id),
  order_item_id   uuid references order_items(id),
  reward_id       uuid,                           -- FK يُضاف بعد إنشاء loyalty_rewards
  reason          text,
  user_id         uuid references users(id),
  idempotency_key text unique,
  created_at      timestamptz not null default now()
);
create index if not exists idx_loyalty_ledger_account on loyalty_ledger (account_id, created_at);
create index if not exists idx_loyalty_ledger_order on loyalty_ledger (order_id);

comment on table loyalty_ledger is
  'المواصفة §46: لا نخزّن stamps=3 — نخزّن كل حركة. الرصيد = Σ(stamps_delta). ضروري للتدقيق والإرجاع.';

drop trigger if exists loyalty_ledger_append_only on loyalty_ledger;
create trigger loyalty_ledger_append_only
  before update or delete on loyalty_ledger
  for each row execute function khazaf_append_only();

-- ── المكافآت (§41 · §45) ─────────────────────────────────────────────
create table if not exists loyalty_rewards (
  id               uuid primary key default gen_random_uuid(),
  business_id      uuid not null references businesses(id),
  account_id       uuid not null references loyalty_accounts(id),
  kind             text not null default 'FREE_DRINK',
  status           reward_status not null default 'AVAILABLE',
  issued_at        timestamptz not null default now(),
  expires_at       timestamptz,
  redeemed_at      timestamptz,
  redeemed_order_id uuid unique references orders(id),   -- §45: لا استخدام مرّتين
  redeemed_by      uuid references users(id)
);
create index if not exists idx_rewards_account on loyalty_rewards (account_id, status);

do $$ begin
  alter table loyalty_ledger add constraint loyalty_ledger_reward_fkey
    foreign key (reward_id) references loyalty_rewards(id);
exception when duplicate_object then null; end $$;

-- المكافأة تنتقل من AVAILABLE فقط، ومرّة واحدة.
create or replace function khazaf_reward_guard() returns trigger
language plpgsql as $$
begin
  if new.status is distinct from old.status and old.status <> 'AVAILABLE' then
    raise exception 'المكافأة % مستهلكة بالفعل (%) — لا تُستخدم مرّتين (§45)', old.id, old.status
      using errcode = 'restrict_violation';
  end if;
  if new.status = 'REDEEMED' and new.redeemed_order_id is null then
    raise exception 'صرف المكافأة يحتاج طلباً مرتبطاً (§42)' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists rewards_guard on loyalty_rewards;
create trigger rewards_guard
  before update on loyalty_rewards
  for each row execute function khazaf_reward_guard();

-- ── المشروب المؤهَّل للكسب (§39 · §40) ──────────────────────────────
alter table products add column if not exists loyalty_eligible boolean not null default true;
comment on column products.loyalty_eligible is
  'يشارك في كسب الأختام (§39). الكيك/المعجّنات وما يستثنيه المالك = false.';

-- عتبة المكافأة والإعدادات (§41)
insert into settings (business_id, branch_id, key, value, note)
select b.id, null, 'loyalty', jsonb_build_object(
         'stamps_per_reward', 5,
         'max_stamps_per_order', 4,
         'reward_max_value', 5000,
         'stamp_expiry_days', 90,
         'earn_on_discounted', true
       ), 'إعدادات الولاء — المواصفة §39–§41'
from businesses b
on conflict do nothing;

-- ── الرصيد المشتقّ ───────────────────────────────────────────────────
create or replace function loyalty_balance(p_account_id uuid) returns integer
language sql stable as $$
  select coalesce(sum(stamps_delta), 0)::integer
  from loyalty_ledger where account_id = p_account_id;
$$;

drop view if exists v_loyalty_accounts;
create view v_loyalty_accounts as
select a.id           as account_id,
       a.business_id,
       c.id           as customer_id,
       c.phone,
       c.name,
       a.status,
       loyalty_balance(a.id) as stamps,
       -- الرصيد قد يصير سالباً إذا أُرجعت فاتورة موّلت مكافأة صُرفت أصلاً (§47).
       -- الدفتر يحتفظ بالحقيقة (stamps)، والشاشة تعرض صفراً بدل رقم سالب محيّر.
       greatest(loyalty_balance(a.id), 0) as stamps_display,
       (select count(*) from loyalty_rewards r
         where r.account_id = a.id and r.status = 'AVAILABLE')::int as rewards_available
from loyalty_accounts a join customers c on c.id = a.customer_id;

comment on view v_loyalty_accounts is
  'ما يراه الباريستا عند إدخال رقم الهاتف: الأختام والمكافآت المتاحة فقط — لا مبالغ ولا تاريخ مالي.';

-- =====================================================================
-- §39 الكسب — يقع داخل معاملة البيع نفسها (§59) عبر مُشغّل على الطلبات
-- =====================================================================
create or replace function khazaf_loyalty_earn() returns trigger
language plpgsql as $$
declare
  v_account  uuid;
  v_stamps   integer;
  v_cap      integer;
  v_per      integer;
  v_balance  integer;
  v_reward   uuid;
begin
  -- شروط الكسب: طلب بيع مكتمل، عليه عميل، وليس مكافأة/موظف/مجاني (§40).
  if new.customer_id is null then return null; end if;
  if new.order_type <> 'SALE' then return null; end if;
  if new.status not in ('PAID','COMPLETED') then return null; end if;
  if tg_op = 'UPDATE' and old.status in ('PAID','COMPLETED') then return null; end if;

  select id into v_account from loyalty_accounts
   where customer_id = new.customer_id and status = 'ACTIVE';
  if not found then return null; end if;

  select coalesce((value->>'stamps_per_reward')::int, 5),
         coalesce((value->>'max_stamps_per_order')::int, 4)
    into v_per, v_cap
    from settings where business_id = new.business_id and branch_id is null and key = 'loyalty';
  v_per := coalesce(v_per, 5);
  v_cap := coalesce(v_cap, 4);

  -- ختم لكل مشروب مؤهَّل غير مجاني (§39) بسقف للفاتورة.
  select least(coalesce(sum(oi.qty), 0), v_cap) into v_stamps
    from order_items oi join products p on p.id = oi.product_id
   where oi.order_id = new.id and p.loyalty_eligible and not oi.is_free;

  if v_stamps is null or v_stamps <= 0 then return null; end if;

  insert into loyalty_ledger (business_id, account_id, type, stamps_delta, order_id,
                              reason, user_id, idempotency_key)
  values (new.business_id, v_account, 'EARN', v_stamps, new.id,
          'كسب من بيع', new.employee_id, 'earn:' || new.id::text)
  on conflict (idempotency_key) do nothing;

  -- إصدار المكافآت تلقائياً كلّما اكتملت العتبة (§41).
  loop
    v_balance := loyalty_balance(v_account);
    exit when v_balance < v_per;

    insert into loyalty_rewards (business_id, account_id, kind, status)
    values (new.business_id, v_account, 'FREE_DRINK', 'AVAILABLE')
    returning id into v_reward;

    insert into loyalty_ledger (business_id, account_id, type, stamps_delta, reward_id,
                                order_id, reason, idempotency_key)
    values (new.business_id, v_account, 'REWARD_ISSUED', -v_per, v_reward, new.id,
            'اكتملت العتبة', 'issue:' || v_reward::text);
  end loop;

  return null;
end;
$$;

-- مُشغّل **مؤجَّل إلى لحظة الـCommit**: البنود تُدرَج بعد صفّ الطلب، فلو نفّذنا
-- الكسب فور إدراج الطلب لوجدنا الفاتورة فارغة. التأجيل يُبقي الكسب داخل نفس
-- المعاملة (§59) ويضمن أن البنود صارت موجودة.
drop trigger if exists orders_loyalty_earn on orders;
create constraint trigger orders_loyalty_earn
  after insert or update on orders
  deferrable initially deferred
  for each row execute function khazaf_loyalty_earn();

-- =====================================================================
-- §47 الإرجاع/الإلغاء يعكس الكسب — ولا يعدّل التاريخ
-- =====================================================================
create or replace function khazaf_loyalty_reverse() returns trigger
language plpgsql as $$
declare
  v_earned integer;
  v_row    record;
begin
  if new.status not in ('REFUNDED','VOIDED','CANCELLED') then return null; end if;
  if old.status = new.status then return null; end if;

  select account_id, coalesce(sum(stamps_delta),0)::int as s into v_row
    from loyalty_ledger where order_id = new.id and type = 'EARN'
    group by account_id;
  if not found then return null; end if;
  v_earned := v_row.s;
  if v_earned <= 0 then return null; end if;

  insert into loyalty_ledger (business_id, account_id, type, stamps_delta, order_id,
                              reason, idempotency_key)
  values (new.business_id, v_row.account_id, 'EARN_REVERSAL', -v_earned, new.id,
          'عكس كسب بسبب ' || new.status::text, 'reversal:' || new.id::text)
  on conflict (idempotency_key) do nothing;

  -- مكافأة صادرة ولم تُصرف ورصيد الحساب صار سالباً → تُلغى (§47).
  update loyalty_rewards r set status = 'CANCELLED'
   where r.account_id = v_row.account_id and r.status = 'AVAILABLE'
     and loyalty_balance(v_row.account_id) < 0
     and r.id = (select id from loyalty_rewards
                  where account_id = v_row.account_id and status = 'AVAILABLE'
                  order by issued_at desc limit 1);
  return null;
end;
$$;

-- مؤجَّل أيضاً كي يقع **بعد** الكسب لو حدثا في معاملة واحدة.
drop trigger if exists orders_loyalty_reverse on orders;
create constraint trigger orders_loyalty_reverse
  after update on orders
  deferrable initially deferred
  for each row execute function khazaf_loyalty_reverse();

-- =====================================================================
-- §42 صرف المكافأة — طلب مستقلّ بإجمالي 0 ودفع بطريقة loyalty
-- =====================================================================
-- ذرّية كاملة: قفل المكافأة · قفل المواد · طلب · بند · دفع 0 · دفتر مخزون
-- · دفتر ولاء. لا كاش ولا فتح درج (§43).
create or replace function redeem_reward(
  p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_shift_id uuid,
  p_reward_id uuid, p_product_id uuid, p_crop uuid, p_fulfillment text,
  p_idempotency_key text
) returns jsonb
language plpgsql as $$
declare
  v_account   uuid;
  v_status    reward_status;
  v_recipe    uuid;
  v_coffee    integer;
  v_takeaway  boolean := (p_fulfillment = 'takeaway');
  v_order_id  uuid;
  v_order_no  integer;
  v_item_id   uuid;
  v_price     integer;
  v_customer  uuid;
begin
  if p_fulfillment not in ('takeaway','dine_in') then raise exception 'نوع تقديم غير صالح'; end if;

  -- منع التكرار (§60)
  select o.id, o.order_number into v_order_id, v_order_no
    from payments pay join orders o on o.id = pay.order_id
   where pay.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no, 'replay', true);
  end if;

  -- قفل المكافأة والتحقّق أنها متاحة (§45)
  select account_id, status into v_account, v_status
    from loyalty_rewards where id = p_reward_id and business_id = p_business_id for update;
  if not found then raise exception 'مكافأة غير موجودة'; end if;
  if v_status <> 'AVAILABLE' then raise exception 'المكافأة غير متاحة (%)', v_status; end if;

  select customer_id into v_customer from loyalty_accounts where id = v_account;

  -- المشروب المؤهَّل + سعره المرجعي (يُعرض في الفاتورة ثم يُخصم بالكامل)
  select price into v_price from product_crops
   where product_id = p_product_id and material_id = p_crop and available;
  if not found then raise exception 'محصول غير متاح لهذا المشروب'; end if;

  perform 1 from products where id = p_product_id and business_id = p_business_id and active and not paused;
  if not found then raise exception 'مشروب غير متاح'; end if;

  select id, coffee_grams into v_recipe, v_coffee from recipes where product_id = p_product_id and active;
  if not found then raise exception 'لا توجد وصفة فعّالة'; end if;

  -- المواد المطلوبة (نفس منطق البيع: الكوب/الغطاء للسفري فقط)
  perform khazaf_drop_temp(array['_need_rw','_agg_rw']);
  create temp table _need_rw on commit drop as
    select p_crop as material_id, v_coffee::integer as qty where v_coffee > 0;
  insert into _need_rw (material_id, qty)
    select ri.material_id, ri.qty from recipe_items ri
     where ri.recipe_id = v_recipe and (v_takeaway or not ri.only_takeaway);

  create temp table _agg_rw on commit drop as
    select material_id, sum(qty)::integer as qty from _need_rw group by material_id;

  perform 1 from materials m join _agg_rw n on n.material_id = m.id order by m.id for update;
  if exists (select 1 from _agg_rw n join materials m on m.id = n.material_id
              where not m.active or (m.cached_stock < n.qty and not m.allow_negative)) then
    raise exception 'المخزون لا يكفي';
  end if;

  update order_counters set next_number = next_number + 1 where branch_id = p_branch_id
    returning next_number - 1 into v_order_no;
  if v_order_no is null then raise exception 'الفرع غير مهيّأ (order_counters)'; end if;

  insert into orders (business_id, branch_id, order_number, shift_id, employee_id, customer_id,
                      status, order_type, fulfillment, subtotal, discount, total, paid_at, completed_at)
  values (p_business_id, p_branch_id, v_order_no, p_shift_id, p_employee_id, v_customer,
          'COMPLETED', 'LOYALTY_REWARD', p_fulfillment::fulfillment_type,
          v_price, v_price, 0, now(), now())
  returning id into v_order_id;

  insert into order_items (order_id, product_id, crop_material_id, unit_price, qty, recipe_snapshot, is_free)
  values (v_order_id, p_product_id, p_crop, v_price, 1,
    jsonb_build_object('coffee_grams', v_coffee, 'crop_material_id', p_crop, 'takeaway', v_takeaway,
      'items', (select coalesce(jsonb_agg(jsonb_build_object(
                          'material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
                from recipe_items ri where ri.recipe_id = v_recipe)),
    true)
  returning id into v_item_id;

  -- سجلّ الخصم: السعر الكامل ← 0 بسبب المكافأة (§42 · §48)
  insert into order_discounts (order_id, order_item_id, kind, value, amount,
                               original_total, final_total, reason, applied_by)
  values (v_order_id, v_item_id, 'COMP', v_price, v_price, v_price, 0, 'مكافأة ولاء', p_employee_id);

  -- دفع بطريقة loyalty بمبلغ 0 — لا كاش ولا بطاقة ولا فتح درج (§43)
  insert into payments (order_id, method, amount, status, idempotency_key)
  values (v_order_id, 'loyalty', 0, 'CONFIRMED', p_idempotency_key);

  -- المخزون ينقص طبيعياً بنوع LOYALTY_REWARD (§12 · §43)
  insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, reason, order_id, user_id)
  select p_business_id, p_branch_id, n.material_id, 'LOYALTY_REWARD', -n.qty, 'مكافأة ولاء', v_order_id, p_employee_id
  from _agg_rw n;

  -- إغلاق المكافأة (مرّة واحدة — يفرضه rewards_guard والقيد الفريد)
  update loyalty_rewards
     set status = 'REDEEMED', redeemed_at = now(),
         redeemed_order_id = v_order_id, redeemed_by = p_employee_id
   where id = p_reward_id;

  insert into loyalty_ledger (business_id, account_id, type, stamps_delta, reward_id, order_id,
                              reason, user_id, idempotency_key)
  values (p_business_id, v_account, 'REWARD_REDEEMED', 0, p_reward_id, v_order_id,
          'صرف مكافأة', p_employee_id, 'redeem:' || p_reward_id::text);

  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, after, reason)
  values (p_business_id, p_branch_id, p_employee_id, 'loyalty_reward_redeemed', 'reward', p_reward_id,
          jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no), 'صرف مكافأة');

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
                            'total', 0, 'replay', false);
end;
$$;
