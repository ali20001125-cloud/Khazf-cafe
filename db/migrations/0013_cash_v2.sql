-- =====================================================================
-- 0013 — الكاش v2: فتح الدرج بلا بيع · تسليم الدرج · فصل السحب عن الإيراد
-- المرجع: المواصفة §22–§28
--
-- المبادئ المفروضة هنا:
--   • الفكّة ليست إيراداً (§23) — الحساب دائماً: الفكّة + Σ الحركات.
--   • DROP و REMOVAL ليسا إيراداً (§24 · §25) وكلاهما سالب في الدفتر النقدي.
--   • العدّ أعمى (§26): counted_cash يُكتب قبل حساب expected_cash، ولا تُعاد
--     أرقام المتوقّع/الفرق لمن لا يملك cash.view_expected.
--   • فتح الدرج بلا بيع (§28) حدث مسجَّل باسم وسبب ووقت — لا حركة نقدية.
-- =====================================================================

do $$ begin
  create type handover_status as enum ('PENDING', 'CONFIRMED', 'CANCELLED');
exception when duplicate_object then null; end $$;

-- ── الفرع في حركات الكاش (§6: كل بيانات تشغيلية مرتبطة بفرع) ─────────
alter table cash_movements add column if not exists branch_id uuid references branches(id);
update cash_movements cm set branch_id = s.branch_id
  from shifts s where s.id = cm.shift_id and cm.branch_id is null;
alter table cash_movements alter column branch_id set not null;
create index if not exists idx_cash_movements_branch on cash_movements (branch_id, created_at);

create or replace function khazaf_cash_branch() returns trigger
language plpgsql as $$
begin
  if new.branch_id is null then
    select branch_id into new.branch_id from shifts where id = new.shift_id;
  end if;
  return new;
end;
$$;

drop trigger if exists cash_movements_branch on cash_movements;
create trigger cash_movements_branch
  before insert on cash_movements
  for each row execute function khazaf_cash_branch();

-- إشارات الحركات: الإيراد موجب، والسحب/الإرجاع/المصروف سالب (§24 · §25).
alter table cash_movements drop constraint if exists cash_movements_sign;
alter table cash_movements add constraint cash_movements_sign check (
  (type in ('OPENING','SALE') and amount >= 0) or
  (type in ('DROP','REMOVAL','EXPENSE','REFUND') and amount <= 0)
);

-- الكاش أيضاً للإلحاق فقط — التصحيح بحركة عكسية.
drop trigger if exists cash_movements_append_only on cash_movements;
create trigger cash_movements_append_only
  before update or delete on cash_movements
  for each row execute function khazaf_append_only();

-- ── §28 فتح الدرج بلا بيع ────────────────────────────────────────────
create table if not exists no_sale_opens (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  branch_id   uuid not null references branches(id),
  shift_id    uuid references shifts(id),
  user_id     uuid not null references users(id),
  reason      text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_no_sale_branch on no_sale_opens (branch_id, created_at);

comment on table no_sale_opens is
  'المواصفة §28: فتح الدرج بلا طلب حدث مسجَّل (موظف · وقت · سبب) — لا وسيلة صامتة لسحب المال.';

-- ── §27 تسليم الدرج بين باريستا وآخر ────────────────────────────────
create table if not exists drawer_handovers (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id),
  shift_id      uuid not null references shifts(id),
  from_user_id  uuid not null references users(id),
  to_user_id    uuid not null references users(id),
  counted_cash  integer not null check (counted_cash >= 0),
  expected_cash integer,                        -- يُحسب خادمياً، لا يُعرض للمُسلِّم
  variance      integer,
  status        handover_status not null default 'PENDING',
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  constraint drawer_handovers_two_people check (from_user_id <> to_user_id)
);
create index if not exists idx_handovers_shift on drawer_handovers (shift_id, created_at);
create unique index if not exists uq_handover_pending_per_shift
  on drawer_handovers (shift_id) where status = 'PENDING';

comment on table drawer_handovers is
  'المواصفة §27: من كان مسؤولاً عن الدرج ومتى انتقلت المسؤولية. التأكيد من المُستلِم.';

-- التأكيد ينقل ملكية الدرج في الوردية.
create or replace function khazaf_handover_confirm() returns trigger
language plpgsql as $$
begin
  if new.status = 'CONFIRMED' and old.status = 'PENDING' then
    update shifts set drawer_owner_id = new.to_user_id where id = new.shift_id;
  elsif new.status is distinct from old.status and old.status <> 'PENDING' then
    raise exception 'تسليم الدرج مُنجَز بالفعل (%)', old.status using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists handover_confirm on drawer_handovers;
create trigger handover_confirm
  before update on drawer_handovers
  for each row execute function khazaf_handover_confirm();

-- ── دالة النقد المتوقّع (§23) — مصدر واحد للحساب ────────────────────
create or replace function shift_expected_cash(p_shift_id uuid) returns integer
language sql stable as $$
  select s.opening_float
       + coalesce((select sum(cm.amount) from cash_movements cm
                   where cm.shift_id = s.id and cm.type <> 'OPENING'), 0)
  from shifts s where s.id = p_shift_id;
$$;

comment on function shift_expected_cash(uuid) is
  'المتوقّع = الفكّة + Σ(الحركات ما عدا OPENING). OPENING مستثناة لأن الفكّة محسوبة أصلاً في opening_float (§23).';

-- ── الإغلاق الأعمى ذرّياً (§26) ──────────────────────────────────────
-- الباريستا يمرّر المعدود فقط. الدالة تحسب المتوقّع والفرق وتخزّنهما.
-- ما يُعاد لا يحتوي أرقاماً مالية: الواجهة تعرض «تم التسليم» فقط.
create or replace function close_shift_blind(
  p_shift_id uuid, p_user_id uuid, p_counted integer
) returns jsonb
language plpgsql as $$
declare
  v_expected integer;
  v_variance integer;
  v_branch   uuid;
  v_business uuid;
begin
  if p_counted is null or p_counted < 0 then raise exception 'عدّ غير صالح'; end if;

  select branch_id, business_id into v_branch, v_business
    from shifts where id = p_shift_id and status = 'OPEN' for update;
  if not found then raise exception 'الوردية غير مفتوحة'; end if;

  v_expected := shift_expected_cash(p_shift_id);
  v_variance := p_counted - v_expected;

  update shifts
     set counted_cash = p_counted, expected_cash = v_expected, variance = v_variance,
         closed_at = now(), status = 'CLOSED'
   where id = p_shift_id;

  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, after, reason)
  values (v_business, v_branch, p_user_id, 'close_shift', 'shift', p_shift_id,
          jsonb_build_object('counted', p_counted, 'expected', v_expected, 'variance', v_variance),
          'إغلاق أعمى');

  -- بلا أرقام: العرض للباريستا محايد. المالك يقرأ الفرق من shifts/التقارير.
  return jsonb_build_object('closed', true);
end;
$$;

-- ── سحب مبيعات الإغلاق (§25) ─────────────────────────────────────────
-- يترك الفكّة القياسية في الدرج ويسحب الباقي. حركة REMOVAL سالبة، ليست إيراداً.
create or replace function cash_removal(
  p_shift_id uuid, p_user_id uuid, p_keep_float integer, p_reason text
) returns jsonb
language plpgsql as $$
declare
  v_expected integer;
  v_amount   integer;
  v_branch   uuid;
  v_business uuid;
begin
  select branch_id, business_id into v_branch, v_business from shifts where id = p_shift_id for update;
  if not found then raise exception 'وردية غير موجودة'; end if;
  if p_keep_float < 0 then raise exception 'فكّة غير صالحة'; end if;

  v_expected := shift_expected_cash(p_shift_id);
  v_amount   := v_expected - p_keep_float;
  if v_amount <= 0 then raise exception 'لا مبلغ للسحب (المتوقّع % ≤ الفكّة %)', v_expected, p_keep_float; end if;

  insert into cash_movements (shift_id, branch_id, type, amount, reason, user_id)
  values (p_shift_id, v_branch, 'REMOVAL', -v_amount, coalesce(nullif(p_reason,''), 'سحب مبيعات'), p_user_id);

  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, after, reason)
  values (v_business, v_branch, p_user_id, 'cash_removal', 'shift', p_shift_id,
          jsonb_build_object('amount', v_amount, 'kept_float', p_keep_float), p_reason);

  return jsonb_build_object('amount', v_amount, 'kept_float', p_keep_float);
end;
$$;
