-- =====================================================================
-- 0028 · مخزون متقدّم: وحدات الشراء · قائمة الشراء · الجرد الجزئي · أسباب الهدر
--
-- المخزون كان يعمل صحيحاً لكنه يتكلّم بلغة الحاسوب: «١٢٠٠٠ مل» و«٢٥٠٠ غ».
-- وصاحب المقهى يشتري **كرتوناً** و**كيساً**، ويحوّل في رأسه عند كل فاتورة —
-- وكل تحويلٍ في الرأس خطأٌ ينتظر.
-- =====================================================================

-- ── ١) وحدات الشراء ──────────────────────────────────────────────────
-- الدفتر يبقى بالوحدة الأساس (هو المرجع الذي يُقاس عليه كل شيء)، والوحدة
-- هنا طبقةُ إدخالٍ فوقه: «كرتون = ١٢ × ١ لتر» يكتبها المالك مرّة، ثم يكتب
-- «٢ كرتون» إلى الأبد.
create table if not exists material_units (
  id          uuid primary key default gen_random_uuid(),
  material_id uuid not null references materials(id),
  name        text not null,                       -- كرتون · كيس ١ كغ · لتر
  base_qty    integer not null check (base_qty > 0), -- كم وحدة أساس فيه
  is_default  boolean not null default false,
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists idx_material_units_material on material_units(material_id, active);
-- وحدة افتراضية واحدة لكل مادة: أكثرُ من افتراضيّ يعني «أيّهما؟» في كل شاشة
create unique index if not exists uq_material_default_unit
  on material_units(material_id) where is_default and active;

comment on table material_units is
  'وحدات شراء المادة. الدفتر بالوحدة الأساس دائماً؛ هذه طبقة إدخالٍ فوقه.';

-- كيف أُدخلت الحركة — يُحفظ للتدقيق والتقارير («كم كرتوناً اشتريت؟»)،
-- بينما `qty_delta` يبقى بالوحدة الأساس فلا يختلّ أي حساب قائم.
alter table inventory_transactions add column if not exists unit_id uuid references material_units(id);
alter table inventory_transactions add column if not exists unit_qty numeric(12,3);

comment on column inventory_transactions.unit_qty is
  'الكمية كما أدخلها المستخدم بوحدة الشراء (٢ كرتون). المرجع يبقى qty_delta بالوحدة الأساس.';

-- الوحدة تُكتب **مع** الإدراج لا بعده: الدفتر للإلحاق فقط (0011)، وحاولتُ
-- أولاً أن أُدرج ثم أُحدّث الصفّ بوحدته فرفض الحارس — وهو محقّ. فوسيطان
-- اختياريان في `record_purchase` نفسها، ويُسقَط التوقيع القديم لئلا يصير
-- النداء بسبعة وسائط غامضاً (كما حدث مع `checkout` في 0025).
drop function if exists record_purchase(uuid,uuid,uuid,uuid,integer,integer,text);

create or replace function record_purchase(
  p_business_id uuid, p_branch_id uuid, p_user_id uuid, p_material_id uuid,
  p_qty integer, p_unit_cost integer, p_reason text,
  p_unit_id uuid default null, p_unit_qty numeric default null
) returns integer
language plpgsql as $fn$
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
    (business_id, branch_id, material_id, type, qty_delta, unit_cost, reason, user_id,
     unit_id, unit_qty)
  values (p_business_id, p_branch_id, p_material_id, 'PURCHASE', p_qty, p_unit_cost,
          coalesce(nullif(p_reason,''),'شراء'), p_user_id, p_unit_id, p_unit_qty);

  -- متوسط مرجّح (عدد صحيح) — تعديل التكلفة فقط، الرصيد طبّقه المُشغّل.
  v_new := round((greatest(v_stock,0)::numeric * v_cost + p_qty::numeric * p_unit_cost)
                 / (greatest(v_stock,0) + p_qty));
  update materials set current_cost = v_new where id = p_material_id;
  return v_stock + p_qty;
end;
$fn$;

comment on function record_purchase(uuid,uuid,uuid,uuid,integer,integer,text,uuid,numeric) is
  'شراء بالوحدة الأساس. الوسيطان الأخيران يصفان كيف أُدخل (٢ كرتون) ويُكتبان مع الصفّ لا بعده.';

-- شراء بوحدة الشراء: يحوّل ثم ينادي `record_purchase` — فلا يتكرّر منطق
-- التكلفة المرجّحة في مكانين.
create or replace function record_purchase_units(
  p_business_id uuid, p_branch_id uuid, p_user_id uuid,
  p_material_id uuid, p_unit_id uuid, p_unit_qty numeric,
  p_cost_per_unit integer, p_reason text default 'شراء'
) returns jsonb
language plpgsql as $fn$
declare
  v_base_qty  integer;
  v_qty       integer;
  v_unit_cost integer;
  v_name      text;
begin
  if p_unit_qty is null or p_unit_qty <= 0 then raise exception 'الكمية غير صالحة'; end if;

  select base_qty, name into v_base_qty, v_name
  from material_units where id = p_unit_id and material_id = p_material_id and active;
  if not found then raise exception 'وحدة شراء غير معروفة لهذه المادة'; end if;

  v_qty := round(p_unit_qty * v_base_qty);
  if v_qty <= 0 then raise exception 'الكمية بعد التحويل صفر'; end if;

  -- التكلفة تُحوَّل للوحدة الأساس: ١٢٬٠٠٠ للكرتون ÷ ١٢٬٠٠٠ مل = ١ للمل.
  -- القسمة الصحيحة تُقرّب، والفرق فلوسٌ تضيع عبر آلاف الحركات — فنقرّب
  -- لأقرب صحيح بدل البتر.
  v_unit_cost := case when p_cost_per_unit is null then null
                      else round(p_cost_per_unit::numeric / v_base_qty) end;

  perform record_purchase(p_business_id, p_branch_id, p_user_id, p_material_id,
                          v_qty, v_unit_cost, p_reason || ' — ' || p_unit_qty || ' ' || v_name,
                          p_unit_id, p_unit_qty);

  return jsonb_build_object('base_qty', v_qty, 'unit_cost', v_unit_cost, 'unit', v_name);
end;
$fn$;

comment on function record_purchase_units(uuid,uuid,uuid,uuid,uuid,numeric,integer,text) is
  'شراء بوحدة الشراء. يحوّل للوحدة الأساس وينادي record_purchase — منطق التكلفة في مكان واحد.';

-- ── ٢) قائمة الشراء ──────────────────────────────────────────────────
-- `low_threshold` يقول «متى أُنبّهك». و`par_level` يقول «إلى أين أُعيدك»:
-- بينهما الفرق بين إنذارٍ وقرار. ومن لا يعرف كم يشتري يشتري إمّا قليلاً
-- فينفد، أو كثيراً فيتلف.
alter table materials add column if not exists par_level integer not null default 0;

comment on column materials.par_level is
  'الرصيد المطلوب بعد الشراء. صفر = بلا اقتراح. الفرق بينه وبين low_threshold: ذاك ينبّه وهذا يقرّر الكمية.';

create or replace function shopping_list(p_business_id uuid, p_days integer default 14)
returns table(
  material_id uuid, name text, base_unit material_unit,
  stock integer, low_threshold integer, par_level integer,
  need_base integer, avg_per_day numeric, days_left numeric,
  unit_id uuid, unit_name text, unit_base_qty integer, need_units numeric,
  urgency text
)
language sql stable as $$
  with span as (select greatest(p_days, 1) as d),
  used as (
    select t.material_id, -sum(t.qty_delta)::numeric as consumed
    from inventory_transactions t cross join span
    where t.type in ('SALE','STAFF','LOYALTY_REWARD','WASTE')
      and t.created_at >= now() - make_interval(days => span.d)
    group by t.material_id
  ),
  du as (
    -- الوحدة الافتراضية إن وُجدت، وإلا أصغر وحدة متاحة (الأقرب للشراء الجزئي)
    select distinct on (material_id) material_id, id, name, base_qty
    from material_units where active
    order by material_id, is_default desc, base_qty asc
  )
  select m.id, m.name, m.base_unit,
         m.cached_stock, m.low_threshold, m.par_level,
         greatest(m.par_level - m.cached_stock, 0) as need_base,
         round(coalesce(u.consumed, 0) / (select d from span), 1) as avg_per_day,
         case when coalesce(u.consumed, 0) > 0
              then round(m.cached_stock / (coalesce(u.consumed, 0) / (select d from span)), 1) end
           as days_left,
         du.id, du.name, du.base_qty,
         -- بوحدة الشراء، مُقرَّبةً **لأعلى**: نصف كرتون لا يُشترى
         case when du.base_qty is not null and greatest(m.par_level - m.cached_stock, 0) > 0
              then ceil(greatest(m.par_level - m.cached_stock, 0)::numeric / du.base_qty) end
           as need_units,
         case
           when m.cached_stock <= 0 then 'out'
           when m.cached_stock <= m.low_threshold then 'low'
           when m.par_level > 0 and m.cached_stock < m.par_level then 'top_up'
           else 'ok'
         end as urgency
  from materials m
  left join used u on u.material_id = m.id
  left join du on du.material_id = m.id
  where m.business_id = p_business_id and m.active
  order by
    case when m.cached_stock <= 0 then 0
         when m.cached_stock <= m.low_threshold then 1
         when m.par_level > 0 and m.cached_stock < m.par_level then 2
         else 3 end,
    m.name;
$$;

comment on function shopping_list(uuid, integer) is
  'ما ينبغي شراؤه: الناقص أولاً، بالكمية وبوحدة الشراء مُقرَّبةً لأعلى.';

-- ── ٣) الجرد الجزئي ──────────────────────────────────────────────────
-- `apply_stock_count` يعالج المواد المذكورة وحدها أصلاً، فالجرد الجزئي
-- ممكن منذ البداية. الناقص أن يُعرَف من الوثيقة أنه جزئي: فرقٌ في جردٍ
-- شامل غير فرقٍ في جرد مادّةٍ واحدة، ومن يقرأ التقرير بعد شهر يحتاج أن
-- يميّز.
alter table stock_counts add column if not exists counted_materials integer;
alter table stock_counts add column if not exists total_materials integer;

comment on column stock_counts.counted_materials is
  'كم مادة شملها هذا الجرد من أصل المواد الفعّالة. أقلّ من الكلّ = جرد جزئي.';

create or replace view v_stock_counts as
  select c.id, c.branch_id, c.user_id, u.name as user_name, u.business_id,
         c.created_at, business_day(c.created_at, c.branch_id) as business_day,
         coalesce(c.counted_materials, (select count(*) from stock_count_items i where i.count_id = c.id))::int
           as counted_materials,
         c.total_materials,
         (c.total_materials is not null
          and coalesce(c.counted_materials, 0) < c.total_materials) as is_partial,
         (select count(*) from stock_count_items i where i.count_id = c.id and i.variance <> 0)::int
           as with_variance
  from stock_counts c
  join users u on u.id = c.user_id;

comment on view v_stock_counts is 'وثائق الجرد وسعتها: شاملة أم جزئية، وكم مادة اختلفت.';

-- ── ٤) أسباب الهدر ───────────────────────────────────────────────────
-- كانت نصّاً حرّاً، فيكتب أحدهم «معايرة» وآخر «معايره» فينقسم التقرير على
-- إملائين. صارت قائمةً يملكها المالك: يضيف ويُعطّل ولا يحذف — فالسبب
-- المستعمَل في حركات الماضي يبقى مقروءاً.
create table if not exists waste_reasons (
  key         text primary key,
  business_id uuid not null references businesses(id),
  label       text not null,
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

comment on table waste_reasons is
  'أسباب الهدر التي يختار منها الباريستا. تُعطَّل ولا تُحذف: التاريخ يشير إليها.';

insert into waste_reasons (key, business_id, label, sort)
select v.key, b.id, v.label, v.sort
from businesses b,
     (values ('dial_in', 'معايرة الصباح', 1),
             ('spill',   'انسكب',        2),
             ('wrong_order', 'طلب خاطئ', 3),
             ('quality', 'جودة غير مقبولة', 4),
             ('expired', 'انتهت صلاحيته', 5),
             ('training', 'تدريب',        6)) as v(key, label, sort)
on conflict (key) do nothing;

-- تكلفة كل سبب: «رميت ٤٢٬٠٠٠ معايرةً هذا الشهر» رقمٌ يُقرأ ويُقرَّر عليه،
-- بخلاف «٢٫٥ كغ».
create or replace function waste_by_reason(p_branch_id uuid, p_days integer default 30)
returns table(reason text, label text, events integer, cost bigint)
language sql stable as $$
  with span as (select greatest(p_days, 1) as d)
  select t.reason,
         coalesce(r.label, t.reason) as label,
         count(*)::int as events,
         sum(-t.qty_delta * coalesce(t.unit_cost, 0))::bigint as cost
  from inventory_transactions t
  cross join span
  left join waste_reasons r on r.key = t.reason
  where t.branch_id = p_branch_id and t.type = 'WASTE'
    and t.created_at >= now() - make_interval(days => span.d)
  group by t.reason, r.label
  order by cost desc;
$$;

comment on function waste_by_reason(uuid, integer) is
  'تكلفة الهدر بالدينار موزّعةً على أسبابه. الغرام لا يُقرأ، والدينار يُقرأ.';
