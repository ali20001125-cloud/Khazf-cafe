-- =====================================================================
-- 0011 — تكامل قاعدة البيانات (المواصفة §12 · §13 · §15 · §51 · §53 · §58)
--
-- ما يفرضه هذا الملفّ **في القاعدة نفسها**، لا في الواجهة ولا في الخادم:
--   1. الدفتر للإلحاق فقط: لا UPDATE ولا DELETE على inventory_transactions.
--   2. سجلّ التدقيق لا يُعدَّل ولا يُحذف.
--   3. `materials.cached_stock` كاتبه الوحيد هو مُشغّل الدفتر — لا تعديل مباشر.
--   4. مخزون سالب ممنوع إلا لمادة مُعلَّمة `allow_negative`.
--   5. المدفوعات: لا حذف، والانتقال الوحيد PENDING → CONFIRMED | FAILED.
--   6. آلة حالة الطلب (§15) مفروضة كمُشغّل.
--   7. لا بيع في يوم مُغلق (§53) إلا بعلم إعادة الفتح.
--
-- **تحويل جوهري:** الدوال القائمة كانت تُحدّث `cached_stock` بنفسها. صار
-- المُشغّل هو من يفعل ذلك، فأُعيدت كتابتها بلا التحديث اليدوي:
--   • هنا: record_purchase · record_waste · apply_stock_count.
--   • في `0015_checkout_v3.sql`: checkout · staff_drink.
-- بغير تطبيق **0011 و0015 معاً** سيُخصم المخزون مرّتين. لا تطبّق أحدهما وحده.
--
-- إعادة التطبيق آمنة (idempotent).
-- =====================================================================

-- ── أعمدة جديدة ──────────────────────────────────────────────────────
alter table materials add column if not exists allow_negative boolean not null default false;
alter table materials add column if not exists dose_grams     integer;  -- جرعة مرجعية (§34: 18غ ≈ دبل)

comment on column materials.allow_negative is 'يسمح برصيد سالب لهذه المادة (استثناء موثّق) — المواصفة §58.';
comment on column materials.dose_grams is 'كمية الجرعة المرجعية للتحويل «الفرق ≈ N جرعة» في تقرير الفروقات (§34).';

alter table branches add column if not exists variance_threshold_pct numeric(5,2) not null default 3.00;
comment on column branches.variance_threshold_pct is 'عتبة تنبيه الفروقات (§34) — نسبة، لا «هدر مسموح».';

-- ── أداة: إسقاط جداول مؤقّتة بلا ضجيج ───────────────────────────────
-- دوال البيع تستخدم جداول مؤقّتة `on commit drop`. لو استُدعيت الدالة مرّتين
-- في معاملة واحدة (إعادة محاولة، دفعة طلبات) لاصطدمت بأسماء موجودة.
create or replace function khazaf_drop_temp(p_names text[]) returns void
language plpgsql as $$
declare n text;
begin
  foreach n in array p_names loop
    if to_regclass('pg_temp.' || quote_ident(n)) is not null then
      execute format('drop table %I', n);
    end if;
  end loop;
end;
$$;

-- =====================================================================
-- 1+2. الجداول للإلحاق فقط
-- =====================================================================
create or replace function khazaf_append_only() returns trigger
language plpgsql as $$
begin
  raise exception 'الجدول % للإلحاق فقط — لا تعديل ولا حذف (المواصفة §12/§51)', tg_table_name
    using errcode = 'restrict_violation';
end;
$$;

drop trigger if exists inv_txn_append_only on inventory_transactions;
create trigger inv_txn_append_only
  before update or delete on inventory_transactions
  for each row execute function khazaf_append_only();

drop trigger if exists audit_log_append_only on audit_log;
create trigger audit_log_append_only
  before update or delete on audit_log
  for each row execute function khazaf_append_only();

-- =====================================================================
-- 3+4. الرصيد مشتقّ من الدفتر
-- =====================================================================
-- مُشغّل الدفتر: كل حركة تُدرج تُطبَّق على cached_stock — وهو الكاتب الوحيد.
create or replace function khazaf_ledger_apply() returns trigger
language plpgsql as $$
begin
  perform set_config('khazaf.ledger', 'on', true);
  update materials set cached_stock = cached_stock + new.qty_delta
    where id = new.material_id;
  perform set_config('khazaf.ledger', 'off', true);
  return null;
end;
$$;

-- ── مصالحة قبل تركيب الحارس ─────────────────────────────────────────
-- على القاعدة الحيّة وُجدت مادة رصيدها 985 مل بلا أي حركة في الدفتر — أي
-- رصيد لا يفسّره شيء. هذا بالضبط ما يسدّه هذا الملفّ. قبل تركيب المُشغّل
-- نكتب حركة تفسّر الفارق، فيصير الرصيد = Σ الدفتر لكل مادة، ويبقى المخزون
-- الفعلي كما هو (لا نُنقص شيئاً من المحل).
--
-- تُنفَّذ **مرّة واحدة فقط**: بعد وجود المُشغّل تصير عملاً لا لزوم له (والفارق
-- صفر أصلاً)، لذا نشترط غياب المُشغّل حتى لا تُطبَّق مرّتين.
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'inv_txn_apply_stock') then
    insert into inventory_transactions
      (business_id, branch_id, material_id, type, qty_delta, reason, user_id, idempotency_key)
    select m.business_id,
           (select id from branches where business_id = m.business_id order by created_at limit 1),
           m.id, 'ADJUSTMENT',
           m.cached_stock - coalesce((select sum(t.qty_delta) from inventory_transactions t
                                       where t.material_id = m.id), 0),
           'مصالحة افتتاحية: رصيد بلا حركة تفسّره (هجرة 0011)',
           (select id from users where business_id = m.business_id and role = 'owner'
             order by created_at limit 1),
           'reconcile-0011:' || m.id::text
    from materials m
    where m.cached_stock <> coalesce((select sum(t.qty_delta) from inventory_transactions t
                                       where t.material_id = m.id), 0);
  end if;
end;
$$;

drop trigger if exists inv_txn_apply_stock on inventory_transactions;
create trigger inv_txn_apply_stock
  after insert on inventory_transactions
  for each row execute function khazaf_ledger_apply();

-- حارس المادة: يمنع التعديل المباشر للرصيد، ويمنع السالب غير المسموح.
create or replace function khazaf_materials_guard() returns trigger
language plpgsql as $$
begin
  if new.cached_stock is distinct from old.cached_stock
     and coalesce(current_setting('khazaf.ledger', true), 'off') <> 'on' then
    raise exception 'الرصيد يُشتقّ من الدفتر — أدرج حركة في inventory_transactions بدل تعديل cached_stock (§12)'
      using errcode = 'restrict_violation';
  end if;
  if new.cached_stock < 0 and not new.allow_negative then
    raise exception 'مخزون سالب ممنوع للمادة «%» (الناتج %) — المواصفة §58', new.name, new.cached_stock
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists materials_guard on materials;
create trigger materials_guard
  before update on materials
  for each row execute function khazaf_materials_guard();

-- =====================================================================
-- 5. المدفوعات: لا حذف، وانتقال حالة واحد فقط
-- =====================================================================
create or replace function khazaf_payments_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'لا يُحذف دفع — التصحيح بإرجاع (§50)' using errcode = 'restrict_violation';
  end if;
  if new.order_id <> old.order_id or new.amount <> old.amount
     or new.method <> old.method or new.idempotency_key <> old.idempotency_key then
    raise exception 'حقول الدفع الأساسية غير قابلة للتعديل (§18)' using errcode = 'restrict_violation';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'PENDING' and new.status in ('CONFIRMED','FAILED')) then
    raise exception 'انتقال حالة دفع غير مسموح: % → % (§18)', old.status, new.status
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists payments_guard on payments;
create trigger payments_guard
  before update or delete on payments
  for each row execute function khazaf_payments_guard();

-- =====================================================================
-- 6. آلة حالة الطلب (§15)
-- =====================================================================
create or replace function khazaf_order_status_guard() returns trigger
language plpgsql as $$
declare
  v_ok boolean;
begin
  if new.status is not distinct from old.status then return new; end if;
  v_ok := case old.status
    when 'DRAFT'              then new.status in ('PENDING_PAYMENT','PAID','COMPLETED','CANCELLED')
    when 'PENDING_PAYMENT'    then new.status in ('DRAFT','PAID','COMPLETED','CANCELLED')
    when 'PAID'               then new.status in ('COMPLETED','VOIDED','REFUNDED','PARTIALLY_REFUNDED')
    when 'COMPLETED'          then new.status in ('VOIDED','REFUNDED','PARTIALLY_REFUNDED')
    when 'PARTIALLY_REFUNDED' then new.status in ('REFUNDED','PARTIALLY_REFUNDED')
    else false                                     -- VOIDED · REFUNDED · CANCELLED نهائية
  end;
  if not v_ok then
    raise exception 'انتقال حالة طلب غير مسموح: % → % (§15)', old.status, new.status
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_status_guard on orders;
create trigger orders_status_guard
  before update on orders
  for each row execute function khazaf_order_status_guard();

-- =====================================================================
-- 7. لا عملية في يوم مُغلق (§53)
-- =====================================================================
create or replace function khazaf_day_closed_guard() returns trigger
language plpgsql as $$
declare
  v_day date;
begin
  if coalesce(current_setting('khazaf.reopen', true), 'off') = 'on' then
    return new;                                    -- المالك يملك day.reopen ويُسجَّل في audit_log
  end if;
  select (now() at time zone b.timezone)::date into v_day
    from branches b where b.id = new.branch_id;
  if exists (select 1 from day_closes d where d.branch_id = new.branch_id and d.business_day = v_day) then
    raise exception 'اليوم % مُغلق لهذا الفرع — لا عمليات جديدة إلا بإعادة فتحه (§53)', v_day
      using errcode = 'restrict_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists orders_day_closed on orders;
create trigger orders_day_closed
  before insert on orders
  for each row execute function khazaf_day_closed_guard();

-- =====================================================================
-- إعادة كتابة الدوال بلا تحديث cached_stock (صار من اختصاص المُشغّل)
-- =====================================================================

-- ── شراء ─────────────────────────────────────────────────────────────
create or replace function record_purchase(
  p_business_id uuid, p_branch_id uuid, p_user_id uuid,
  p_material_id uuid, p_qty integer, p_unit_cost integer, p_reason text
) returns integer
language plpgsql as $$
declare
  v_stock integer;
  v_cost  integer;
  v_new   integer;
begin
  if p_qty <= 0 then raise exception 'كمية غير صالحة'; end if;
  if p_unit_cost < 0 then raise exception 'تكلفة غير صالحة'; end if;

  select cached_stock, current_cost into v_stock, v_cost
    from materials where id = p_material_id and business_id = p_business_id for update;
  if not found then raise exception 'مادة غير موجودة'; end if;

  insert into inventory_transactions
    (business_id, branch_id, material_id, type, qty_delta, unit_cost, reason, user_id)
  values (p_business_id, p_branch_id, p_material_id, 'PURCHASE', p_qty, p_unit_cost,
          coalesce(nullif(p_reason,''),'شراء'), p_user_id);

  -- متوسط مرجّح (عدد صحيح) — تعديل التكلفة فقط، الرصيد طبّقه المُشغّل.
  v_new := round((greatest(v_stock,0)::numeric * v_cost + p_qty::numeric * p_unit_cost)
                 / (greatest(v_stock,0) + p_qty));
  update materials set current_cost = v_new where id = p_material_id;
  return v_stock + p_qty;
end;
$$;

-- ── هدر ──────────────────────────────────────────────────────────────
-- p_reason يجب أن يكون من أسباب المواصفة §29 (يُفحص في khazaf_waste_reason).
create or replace function record_waste(
  p_business_id uuid, p_branch_id uuid, p_user_id uuid,
  p_material_id uuid, p_qty integer, p_reason text
) returns integer
language plpgsql as $$
declare v_stock integer;
begin
  if p_qty <= 0 then raise exception 'كمية غير صالحة'; end if;
  if p_reason is null or p_reason = '' then raise exception 'الهدر يحتاج سبباً (§29)'; end if;

  select cached_stock into v_stock
    from materials where id = p_material_id and business_id = p_business_id for update;
  if not found then raise exception 'مادة غير موجودة'; end if;
  if v_stock < p_qty then raise exception 'الكمية أكبر من المخزون'; end if;

  insert into inventory_transactions
    (business_id, branch_id, material_id, type, qty_delta, reason, user_id)
  values (p_business_id, p_branch_id, p_material_id, 'WASTE', -p_qty, p_reason, p_user_id);

  return v_stock - p_qty;
end;
$$;

-- ── جرد أعمى + تسوية ─────────────────────────────────────────────────
create or replace function apply_stock_count(
  p_business_id uuid, p_branch_id uuid, p_user_id uuid, p_counts jsonb
) returns jsonb
language plpgsql as $$
declare
  v_count_id uuid;
  v_row      jsonb;
  v_material uuid;
  v_counted  integer;
  v_expected integer;
  v_variance integer;
  v_pct      numeric(6,2);
  v_result   jsonb := '[]'::jsonb;
  v_name     text;
begin
  if p_counts is null or jsonb_array_length(p_counts) = 0 then
    raise exception 'لا مواد في الجرد';
  end if;

  insert into stock_counts (branch_id, user_id, status)
  values (p_branch_id, p_user_id, 'COMPLETED') returning id into v_count_id;

  for v_row in select * from jsonb_array_elements(p_counts) loop
    v_material := (v_row->>'material_id')::uuid;
    v_counted  := (v_row->>'counted')::integer;
    if v_counted < 0 then raise exception 'عدد غير صالح'; end if;

    select cached_stock, name into v_expected, v_name
      from materials where id = v_material and business_id = p_business_id for update;
    if not found then raise exception 'مادة غير موجودة'; end if;

    v_variance := v_counted - v_expected;
    v_pct := case when v_expected = 0 then null
                  else round((v_variance::numeric * 100) / v_expected, 2) end;

    insert into stock_count_items (count_id, material_id, expected, counted, variance, variance_pct)
    values (v_count_id, v_material, v_expected, v_counted, v_variance, v_pct);

    -- التصحيح حركة واحدة بمقدار الفرق؛ المُشغّل يجعل الرصيد = المعدود.
    if v_variance <> 0 then
      insert into inventory_transactions
        (business_id, branch_id, material_id, type, qty_delta, reason, count_id, user_id)
      values (p_business_id, p_branch_id, v_material, 'ADJUSTMENT', v_variance, 'تسوية جرد', v_count_id, p_user_id);
    end if;

    v_result := v_result || jsonb_build_object(
      'material_id', v_material, 'name', v_name,
      'expected', v_expected, 'counted', v_counted,
      'variance', v_variance, 'variance_pct', v_pct);
  end loop;

  return jsonb_build_object('count_id', v_count_id, 'items', v_result);
end;
$$;
