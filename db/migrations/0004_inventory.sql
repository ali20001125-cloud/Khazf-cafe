-- =====================================================================
-- م٥ — المخزون: شراء · هدر · جرد وفرق  (دوال ذرّية)
-- المرجع: CAFE-POS-TECH.md §المخزون.
-- كل عملية = حركة في الدفتر + تحديث cached_stock في معاملة واحدة.
--   • الشراء: PURCHASE (+) + متوسط تكلفة مرجّح.
--   • الهدر: WASTE (−) بسبب، مع منع السالب.
--   • الجرد: وثيقة عدّ (stock_counts/items) + تسوية ADJUSTMENT (±الفرق)
--     تجعل cached_stock = المعدود. الرصيد = Σ الدفتر يبقى صحيحاً.
-- =====================================================================

-- ── شراء (إضافة مخزون) ───────────────────────────────────────────────
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

  -- متوسط مرجّح (عدد صحيح)
  v_new := round((v_stock::numeric * v_cost + p_qty::numeric * p_unit_cost) / (v_stock + p_qty));
  update materials set cached_stock = cached_stock + p_qty, current_cost = v_new
    where id = p_material_id;
  return v_stock + p_qty;
end;
$$;

-- ── هدر ──────────────────────────────────────────────────────────────
create or replace function record_waste(
  p_business_id uuid, p_branch_id uuid, p_user_id uuid,
  p_material_id uuid, p_qty integer, p_reason text
) returns integer
language plpgsql as $$
declare v_stock integer;
begin
  if p_qty <= 0 then raise exception 'كمية غير صالحة'; end if;
  if p_reason is null or p_reason = '' then raise exception 'الهدر يحتاج سبباً'; end if;

  select cached_stock into v_stock
    from materials where id = p_material_id and business_id = p_business_id for update;
  if not found then raise exception 'مادة غير موجودة'; end if;
  if v_stock < p_qty then raise exception 'الكمية أكبر من المخزون'; end if;

  insert into inventory_transactions
    (business_id, branch_id, material_id, type, qty_delta, reason, user_id)
  values (p_business_id, p_branch_id, p_material_id, 'WASTE', -p_qty, p_reason, p_user_id);

  update materials set cached_stock = cached_stock - p_qty where id = p_material_id;
  return v_stock - p_qty;
end;
$$;

-- ── جرد أعمى + تسوية ────────────────────────────────────────────────
-- p_counts: [{material_id, counted}] — يقارن بالمتوقّع (cached_stock) لحظة الجرد.
create or replace function apply_stock_count(
  p_business_id uuid, p_branch_id uuid, p_user_id uuid, p_counts jsonb
) returns jsonb
language plpgsql as $$
declare
  v_count_id uuid;
  v_row jsonb;
  v_material uuid;
  v_counted integer;
  v_expected integer;
  v_variance integer;
  v_pct numeric(6,2);
  v_result jsonb := '[]'::jsonb;
  v_name text;
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

    if v_variance <> 0 then
      insert into inventory_transactions
        (business_id, branch_id, material_id, type, qty_delta, reason, count_id, user_id)
      values (p_business_id, p_branch_id, v_material, 'ADJUSTMENT', v_variance, 'تسوية جرد', v_count_id, p_user_id);
      update materials set cached_stock = v_counted where id = v_material;
    end if;

    v_result := v_result || jsonb_build_object(
      'material_id', v_material, 'name', v_name,
      'expected', v_expected, 'counted', v_counted,
      'variance', v_variance, 'variance_pct', v_pct);
  end loop;

  return jsonb_build_object('count_id', v_count_id, 'items', v_result);
end;
$$;
