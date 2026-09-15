-- =====================================================================
-- 0029 · الدوام والوقت الإضافي · وسم البيع الذي تمّ بلا إنترنت
--
-- الوقت الإضافي بلا دليلٍ عليه هو ظنّ، لا حساب. فالنظام هنا لا يسأل «كم
-- بقيت؟» بل «هل كان هناك عمل؟» — والفاتورة هي الدليل: مالٌ دخل الدرج في
-- تلك الدقيقة. دقائق بعد الدوام بلا فاتورة واحدة تُعرض ولا تُحتسب أجراً.
-- =====================================================================

-- ── ١) إعداد الدوام الرسمي على الفرع ─────────────────────────────────
-- ٤ عصراً ← ١٢ ليلاً افتراضاً (٢٤ = منتصف ليل اليوم نفسه، لا اليوم التالي).
alter table branches add column if not exists shift_start_hour integer not null default 16;
alter table branches add column if not exists shift_end_hour   integer not null default 24;
-- كم فاتورة تُثبت أن الوقت الإضافي كان عملاً؟ واحدة تكفي: الفاتورة مالٌ
-- في الدرج، فهي أصعب على التزوير من بصمة حضور.
alter table branches add column if not exists overtime_min_orders integer not null default 1;

alter table branches drop constraint if exists branches_shift_hours_chk;
alter table branches add constraint branches_shift_hours_chk
  check (shift_start_hour between 0 and 23 and shift_end_hour between 1 and 30
         and shift_end_hour > shift_start_hour) not valid;

comment on column branches.shift_end_hour is
  'ساعة نهاية الدوام الرسمي بتوقيت الفرع. أكبر من ٢٤ = بعد منتصف الليل (٢٦ = ٢ فجراً).';
comment on column branches.overtime_min_orders is
  'أقلّ عدد فواتير خلال الوقت الإضافي ليُحتسب أجراً. صفر = يُحتسب دائماً.';

-- ── ٢) وسم البيع الذي تمّ بلا إنترنت ─────────────────────────────────
-- الإدارة كانت تعرف أن البيع بلا إنترنت يعمل، ولا تعرف أنه حدث. وطابور
-- المتصفّح لا يراه إلا صاحب الجهاز — فالخادم هو من يجب أن يشهد.
alter table orders add column if not exists synced_at timestamptz;

comment on column orders.synced_at is
  'وقت وصول الفاتورة للخادم حين بيعت بلا إنترنت. فارغ = بيعت والخادم متّصل.';

create index if not exists idx_orders_synced on orders(branch_id, synced_at)
  where synced_at is not null;

CREATE OR REPLACE FUNCTION public.checkout(p_business_id uuid, p_branch_id uuid, p_employee_id uuid, p_shift_id uuid, p_fulfillment text, p_method text, p_tendered integer, p_idempotency_key text, p_items jsonb, p_customer_id uuid, p_discount jsonb, p_occurred_at timestamptz DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
AS $function$
declare
  -- لحظة البيع: الوقت الحقيقي إن مُرِّر (بيعٌ تمّ بلا إنترنت ورُفع لاحقاً)،
  -- وإلا الآن. لا يُترك للقاعدة أن تفترض أن وقت الكتابة هو وقت البيع.
  v_at         timestamptz := coalesce(p_occurred_at, now());
  v_item       jsonb;
  v_product_id uuid;
  v_crop       uuid;
  v_qty        integer;
  v_price      integer;
  v_recipe_id  uuid;
  v_coffee     integer;
  v_line_price integer;
  v_grams      integer;
  v_subtotal   integer := 0;
  v_discount   integer := 0;
  v_total      integer;
  v_change     integer := null;
  v_order_id   uuid;
  v_order_no   integer;
  v_takeaway   boolean := (p_fulfillment = 'takeaway');
  v_opt        jsonb;
  v_optrow     modifier_options%rowtype;
  v_swap_from  uuid[];
  v_swap_to    uuid[];
  v_opt_snap   jsonb;
  v_line       record;
  v_item_id    uuid;
  v_eff_mat    uuid;
  v_pos        integer;
  v_ri         record;
  v_dkind      text;
  v_dvalue     integer;
begin
  if p_fulfillment not in ('takeaway','dine_in') then raise exception 'نوع تقديم غير صالح'; end if;
  if p_method not in ('cash','card') then raise exception 'طريقة دفع غير صالحة'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'الطلب فارغ'; end if;

  -- §60 منع التكرار: إعادة الإرسال ترجع نفس النتيجة بلا أثر ثانٍ.
  select o.id, o.order_number, o.total, pay.change
    into v_order_id, v_order_no, v_total, v_change
  from payments pay join orders o on o.id = pay.order_id
  where pay.idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
      'total', v_total, 'change', v_change, 'replay', true);
  end if;

  -- §29/§66 القفل الطارئ يُفحص في القاعدة أيضاً، لا في الواجهة وحدها.
  perform 1 from branches where id = p_branch_id and not pos_locked;
  if not found then raise exception 'الكاشير مقفول — راجع المالك'; end if;

  -- تنظيف احترازي: يسمح باستدعاء الدالة أكثر من مرّة في المعاملة الواحدة.
  perform khazaf_drop_temp(array['_lines','_req','_need']);
  create temp table _lines (line_no serial, product_id uuid, crop_material_id uuid, qty integer,
    unit_price integer, recipe_id uuid, coffee_grams integer, options jsonb) on commit drop;
  create temp table _req (material_id uuid, qty integer) on commit drop;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_product_id := (v_item->>'product_id')::uuid;
    v_crop       := (v_item->>'crop_material_id')::uuid;
    v_qty        := (v_item->>'qty')::integer;
    if v_qty is null or v_qty <= 0 then raise exception 'كمية غير صالحة'; end if;

    perform 1 from products where id = v_product_id and business_id = p_business_id and active and not paused;
    if not found then raise exception 'مشروب غير متاح'; end if;

    -- §14: يُباع فقط من محصول متاح، والسعر يُقرأ من القاعدة لا من المتصفح.
    select price into v_price from product_crops
     where product_id = v_product_id and material_id = v_crop and available;
    if not found then raise exception 'محصول غير متاح لهذا المشروب'; end if;

    select id, coffee_grams into v_recipe_id, v_coffee from recipes where product_id = v_product_id and active;
    if not found then raise exception 'لا توجد وصفة فعّالة'; end if;

    v_line_price := v_price;
    v_grams      := v_coffee;
    v_swap_from  := '{}';
    v_swap_to    := '{}';
    v_opt_snap   := '[]'::jsonb;

    if v_item ? 'options' then
      for v_opt in select * from jsonb_array_elements(v_item->'options') loop
        select mo.* into v_optrow
        from modifier_options mo
        join product_modifier_groups pmg on pmg.group_id = mo.group_id
        where mo.id = (v_opt#>>'{}')::uuid and pmg.product_id = v_product_id and mo.available;
        if not found then raise exception 'خيار غير متاح'; end if;

        v_line_price := v_line_price + v_optrow.price_delta;
        if v_optrow.add_to_crop_grams then
          v_grams := v_grams + v_optrow.qty;
        elsif v_optrow.replaces_base_material_id is not null then
          v_swap_from := array_append(v_swap_from, v_optrow.replaces_base_material_id);
          v_swap_to   := array_append(v_swap_to,   v_optrow.material_id);
        elsif v_optrow.material_id is not null and v_optrow.qty > 0 then
          insert into _req values (v_optrow.material_id, v_optrow.qty * v_qty);
        end if;
        v_opt_snap := v_opt_snap || jsonb_build_object(
          'option_id', v_optrow.id, 'name', v_optrow.name, 'price_delta', v_optrow.price_delta);
      end loop;
    end if;

    if v_grams > 0 then insert into _req values (v_crop, v_grams * v_qty); end if;

    -- §31: الكميات من الوصفة، لا يُدخلها الباريستا.
    for v_ri in select material_id, qty, only_takeaway from recipe_items where recipe_id = v_recipe_id loop
      if (not v_takeaway) and v_ri.only_takeaway then continue; end if;
      v_eff_mat := v_ri.material_id;
      v_pos := array_position(v_swap_from, v_ri.material_id);
      if v_pos is not null then v_eff_mat := v_swap_to[v_pos]; end if;
      insert into _req values (v_eff_mat, v_ri.qty * v_qty);
    end loop;

    v_subtotal := v_subtotal + v_line_price * v_qty;
    insert into _lines (product_id, crop_material_id, qty, unit_price, recipe_id, coffee_grams, options)
      values (v_product_id, v_crop, v_qty, v_line_price, v_recipe_id, v_grams, v_opt_snap);
  end loop;

  create temp table _need on commit drop as
    select material_id, sum(qty)::integer as qty from _req group by material_id;

  -- §13/§14: قفل صفوف المواد ثم إعادة التحقّق — يمنع البيع المزدوج والسالب.
  perform 1 from materials m join _need n on n.material_id = m.id order by m.id for update;
  if exists (select 1 from _need n join materials m on m.id = n.material_id
              where not m.active or (m.cached_stock < n.qty and not m.allow_negative)) then
    raise exception 'المخزون لا يكفي لإتمام الطلب';
  end if;

  -- §48: الخصم يُحسب في القاعدة ويُسجَّل كوثيقة، ولا يُعدَّل سعر البند.
  if p_discount is not null and p_discount ? 'kind' then
    v_dkind  := p_discount->>'kind';
    v_dvalue := coalesce((p_discount->>'value')::integer, 0);
    v_discount := case v_dkind
      when 'PERCENT' then round(v_subtotal::numeric * least(greatest(v_dvalue,0),100) / 100)::integer
      when 'AMOUNT'  then least(greatest(v_dvalue,0), v_subtotal)
      when 'COMP'    then v_subtotal
      else 0 end;
    if coalesce(p_discount->>'reason','') = '' then raise exception 'الخصم يحتاج سبباً (§48)'; end if;
  end if;

  v_total := v_subtotal - v_discount;

  -- §17: لا إغلاق إذا المدفوع أقل من المطلوب.
  if p_method = 'cash' then
    if p_tendered is null or p_tendered < v_total then raise exception 'المبلغ المدفوع أقل من الإجمالي'; end if;
    v_change := p_tendered - v_total;
  end if;

  -- §19: رقم الفاتورة عدّاد لكل فرع، يتقدّم بعد اجتياز كل التحقّقات (بلا فجوات).
  update order_counters set next_number = next_number + 1 where branch_id = p_branch_id
    returning next_number - 1 into v_order_no;
  if v_order_no is null then raise exception 'الفرع غير مهيّأ (order_counters)'; end if;

  insert into orders (business_id, branch_id, order_number, shift_id, employee_id, customer_id,
                      status, order_type, fulfillment, subtotal, discount, total,
                      created_at, paid_at, completed_at, synced_at)
  values (p_business_id, p_branch_id, v_order_no, p_shift_id, p_employee_id, p_customer_id,
          'COMPLETED', 'SALE', p_fulfillment::fulfillment_type,
          v_subtotal, v_discount, v_total, v_at, v_at, v_at,
          -- بيعٌ وصل بوقته الحقيقي = بيعٌ تمّ بلا إنترنت ورُفع الآن. نختمه هنا
          -- لأن الدفتر للإلحاق فقط، فلا سبيل لوسمه بتحديثٍ بعد الإدراج.
          case when p_occurred_at is null then null else now() end)
  returning id into v_order_id;

  for v_line in select * from _lines order by line_no loop
    -- §10: لقطة الوصفة تُجمَّد مع البند — تغيير الوصفة لاحقاً لا يمسّ التاريخ.
    insert into order_items (order_id, product_id, crop_material_id, unit_price, qty, recipe_snapshot, is_free)
    values (v_order_id, v_line.product_id, v_line.crop_material_id, v_line.unit_price, v_line.qty,
      jsonb_build_object('coffee_grams', v_line.coffee_grams, 'crop_material_id', v_line.crop_material_id,
        'takeaway', v_takeaway, 'options', v_line.options,
        'items', (select coalesce(jsonb_agg(jsonb_build_object(
                            'material_id', ri.material_id, 'qty', ri.qty, 'only_takeaway', ri.only_takeaway)), '[]'::jsonb)
                  from recipe_items ri where ri.recipe_id = v_line.recipe_id)),
      false)
    returning id into v_item_id;

    insert into order_item_modifiers (order_item_id, option_id, name, price_delta)
    select v_item_id, (o->>'option_id')::uuid, o->>'name', (o->>'price_delta')::integer
    from jsonb_array_elements(v_line.options) o;
  end loop;

  if v_discount > 0 then
    insert into order_discounts (order_id, kind, value, amount, original_total, final_total,
                                 reason, applied_by, approved_by)
    values (v_order_id, v_dkind::discount_kind, coalesce(v_dvalue,0), v_discount, v_subtotal, v_total,
            p_discount->>'reason', p_employee_id, nullif(p_discount->>'approved_by','')::uuid);
  end if;

  insert into payments (order_id, method, amount, tendered, change, status, idempotency_key, created_at)
  values (v_order_id, p_method::payment_method, v_total, p_tendered, v_change, 'CONFIRMED', p_idempotency_key, v_at);

  -- الدفتر فقط — cached_stock يطبّقه inv_txn_apply_stock (0011).
  insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, reason, order_id, user_id, created_at)
  select p_business_id, p_branch_id, n.material_id, 'SALE', -n.qty, 'بيع', v_order_id, p_employee_id, v_at
  from _need n;

  if p_method = 'cash' and p_shift_id is not null then
    insert into cash_movements (shift_id, branch_id, type, amount, reason, user_id, created_at)
    values (p_shift_id, p_branch_id, 'SALE', v_total, 'بيع', p_employee_id, v_at);
  end if;

  -- كسب الولاء وقع داخل هذه المعاملة عبر مُشغّل orders_loyalty_earn (§59).
  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_no,
    'total', v_total, 'discount', v_discount, 'change', v_change, 'replay', false);
end;
$function$

;;

comment on function checkout(uuid,uuid,uuid,uuid,text,text,integer,text,jsonb,uuid,jsonb,timestamptz) is
  'البيع. `p_occurred_at` لحظة البيع الحقيقية (بلا إنترنت)، و`synced_at` تُختم معها فتعرف الإدارة أن الفاتورة تأخّرت.';

-- ── ٣) ساعات الوردية: عاديّ · إضافيّ · إضافيّ مُثبَت ─────────────────
-- الوردية تُقاس بنافذة الدوام الرسمي ليومها المحاسبي. ثلاثة أرقام لا واحد:
-- ما قبل الدوام (يُعرض ولا يُحتسب) · داخل الدوام · بعده. والأخير يُدفع
-- بشرطه.
create or replace view v_shift_hours as
  with s as (
    select sh.*, b.timezone, b.shift_start_hour, b.shift_end_hour,
           b.overtime_min_orders,
           business_day(sh.opened_at, sh.branch_id) as business_day,
           coalesce(sh.closed_at, now()) as ended_at
    from shifts sh join branches b on b.id = sh.branch_id
  ),
  w as (
    select s.*,
      ((s.business_day + make_interval(hours => s.shift_start_hour)) at time zone s.timezone) as win_start,
      ((s.business_day + make_interval(hours => s.shift_end_hour))   at time zone s.timezone) as win_end
    from s
  )
  select w.id as shift_id, w.business_id, w.branch_id, w.employee_id, u.name as employee_name,
         w.business_day, w.opened_at, w.closed_at, w.status,
         round(extract(epoch from (w.ended_at - w.opened_at)) / 60)::int as worked_minutes,
         -- قبل الدوام: يُعرض ليُسأل عنه، ولا يدخل الأجر
         greatest(0, round(extract(epoch from
           (least(w.ended_at, w.win_start) - w.opened_at)) / 60))::int as early_minutes,
         greatest(0, round(extract(epoch from
           (least(w.ended_at, w.win_end) - greatest(w.opened_at, w.win_start))) / 60))::int
           as regular_minutes,
         greatest(0, round(extract(epoch from
           (w.ended_at - greatest(w.opened_at, w.win_end))) / 60))::int as overtime_minutes,
         (select count(*) from orders o
          where o.shift_id = w.id and o.status <> 'VOIDED' and o.created_at >= w.win_end)::int
           as overtime_orders,
         w.win_end as overtime_from
  from w join users u on u.id = w.employee_id;

comment on view v_shift_hours is
  'ساعات كل وردية موزّعةً: قبل الدوام · داخله · بعده، مع عدد فواتير الوقت الإضافي.';

-- الأجر الإضافي: الدقائق بعد الدوام **إن** رافقتها فواتير. وإلا صفر مع
-- بقاء الدقائق ظاهرةً — النظام لا يخفي ولا يتّهم، يعرض ويترك القرار.
create or replace function staff_hours(
  p_business_id uuid, p_from date, p_to date
) returns table(
  employee_id uuid, employee_name text, shifts integer,
  regular_minutes integer, overtime_minutes integer,
  paid_overtime_minutes integer, unpaid_overtime_minutes integer,
  early_minutes integer, overtime_orders integer
)
language sql stable as $$
  select h.employee_id, h.employee_name, count(*)::int,
         sum(h.regular_minutes)::int,
         sum(h.overtime_minutes)::int,
         sum(case when h.overtime_orders >= b.overtime_min_orders
                  then h.overtime_minutes else 0 end)::int,
         sum(case when h.overtime_orders >= b.overtime_min_orders
                  then 0 else h.overtime_minutes end)::int,
         sum(h.early_minutes)::int,
         sum(h.overtime_orders)::int
  from v_shift_hours h
  join branches b on b.id = h.branch_id
  where h.business_id = p_business_id
    and h.business_day between p_from and p_to
    and h.status <> 'OPEN'
  group by h.employee_id, h.employee_name
  order by sum(h.regular_minutes + h.overtime_minutes) desc;
$$;

comment on function staff_hours(uuid, date, date) is
  'ساعات كل موظف في مدّة: العاديّ · الإضافيّ · ما يُدفع منه وما لا يُدفع (بلا فواتير تُثبته).';

-- ── ٤) حالة البيع بلا إنترنت — للإدارة ───────────────────────────────
create or replace function offline_status(p_branch_id uuid, p_days integer default 7)
returns jsonb
language sql stable as $$
  with span as (select greatest(p_days, 1) as d),
  o as (
    select o.* from orders o cross join span
    where o.branch_id = p_branch_id
      and o.created_at >= now() - make_interval(days => span.d)
  )
  select jsonb_build_object(
    'days',          (select d from span),
    'orders_total',  (select count(*) from o),
    'orders_offline',(select count(*) from o where synced_at is not null),
    'last_sync_at',  (select max(synced_at) from o),
    'longest_delay_minutes',
      (select round(max(extract(epoch from (synced_at - created_at))) / 60)::int
       from o where synced_at is not null),
    'today_offline',
      (select count(*) from o
       where synced_at is not null
         and business_day(created_at, p_branch_id) = current_business_day(p_branch_id))
  );
$$;

comment on function offline_status(uuid, integer) is
  'كم فاتورة بيعت بلا إنترنت، ومتى آخر مزامنة، وكم طال أطول تأخير.';
