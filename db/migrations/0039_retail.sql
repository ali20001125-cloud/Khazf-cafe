-- =====================================================================
-- 0039 · بيع البضاعة: أكياس البنّ والأدوات
--
-- قال المالك: «الأكياس تُضاف كعدد لا بالغرام · تكلفتها من تكلفة البنّ
-- (الكيلو ٣٠ ألفاً ⇒ الربع ٧٬٥٠٠) · نضيف كلفةً للطلب سواء اشترى كيساً أو
-- عشرة، تخصّ تغليف الطلب: كيسٌ وملصق — أما طباعة الكيس نفسه وملصقه
-- فمضافةٌ أصلاً في كلفته · اعزل أرباح ومبيعات الأكياس عن المشروبات ·
-- ودعمٌ للأدوات والأكواب لا المحاصيل فقط».
--
-- **البضاعة لا تحتاج آليةً جديدة.** «المحصول» في هذا النظام ليس قهوةً
-- بالضرورة — هو *النوع الذي يختاره الزبون ويَنقص وحده*. فكيس البنّ
-- منتجٌ بثلاثة أنواع، والكوب منتجٌ بنوعٍ واحد (والكاشير يضيفه بضغطة
-- لأن ذا النوع الواحد لا يفتح حواراً). ما يلزم حقاً شيئان:
--
--   ١. **تمييز**: أيّ منتجٍ بضاعة وأيّ مادةٍ للبيع — بلا تمييز لا يمكن
--      عزل الأرباح، ويبقى ربح البنّ مخلوطاً بربح اللاتيه فلا يُعرف
--      أيّهما يكسب.
--   ٢. **كلفة التغليف**: تكلفةٌ للطلب لا للصنف. عشرة أكياس في كيسٍ
--      واحد بملصقٍ واحد — فهي تُحسب مرّةً مهما كَثُر ما فيه.
--
-- والتغليف **تكلفةٌ لا تُحمَّل على الزبون**: لا تظهر في فاتورته ولا
-- تزيد ما يدفع. تنقص الربح وحدها، كما ينقصه الهدر.
-- =====================================================================

-- ── ١) التمييز ───────────────────────────────────────────────────────
alter table products
  add column if not exists kind text not null default 'drink';
alter table products drop constraint if exists products_kind_chk;
alter table products
  add constraint products_kind_chk check (kind in ('drink', 'retail'));

comment on column products.kind is
  'drink = يُحضَّر ويُشرب · retail = بضاعة تُباع كما هي (أكياس · أدوات). يفصل الأرباح والمبيعات.';

alter table materials
  add column if not exists is_retail boolean not null default false;

comment on column materials.is_retail is
  'مادة للبيع لا للتحضير. تفصل تكلفة البضاعة عن تكلفة المشروبات في الدفتر نفسه، فلا يُخمَّن أيّهما كلّف.';

create index if not exists idx_materials_retail on materials (business_id) where is_retail;

-- ── ٢) كلفة تغليف الطلب ──────────────────────────────────────────────
-- الفريد جزئيّ (branch_id is null)، فلا يُطابقه `on conflict` بأعمدةٍ ثلاثة
insert into settings (business_id, key, value, note)
select b.id, 'retail_packaging_cost', '2000'::jsonb,
       'كلفة تغليف الطلب الواحد الذي فيه بضاعة — مرّةً واحدة مهما كثرت أصنافه'
from businesses b
where not exists (
  select 1 from settings s
  where s.business_id = b.id and s.branch_id is null
    and s.key = 'retail_packaging_cost'
);

-- ── ٣) تكلفة كل فاتورة، مقسومةً بضاعةً ومشروبات ─────────────────────
-- الدفتر نفسه يفصلها: المادة إمّا للبيع أو للتحضير، فلا تخمين.
create or replace view v_order_cogs_split as
  select t.order_id,
         sum(-t.qty_delta * coalesce(t.unit_cost, 0))
           filter (where m.is_retail)::int      as cogs_retail,
         sum(-t.qty_delta * coalesce(t.unit_cost, 0))
           filter (where not m.is_retail)::int  as cogs_drink,
         bool_or(m.is_retail)                   as has_retail,
         bool_and(t.unit_cost is not null)      as cost_complete
  from inventory_transactions t
  join materials m on m.id = t.material_id
  where t.order_id is not null and t.type in ('SALE', 'STAFF', 'LOYALTY_REWARD')
  group by t.order_id;

comment on view v_order_cogs_split is
  'تكلفة الفاتورة مقسومةً: بضاعةٌ ومشروبات. القسمة من المادة نفسها لا من تخمين، و`has_retail` تقرّر إن كانت كلفة التغليف تُحسب على هذه الفاتورة.';

-- ── ٤) إيراد كل فاتورة، مقسوماً بالمثل ───────────────────────────────
create or replace view v_order_revenue_split as
  select oi.order_id,
         sum(oi.unit_price * oi.qty) filter (where p.kind = 'retail')::int as revenue_retail,
         sum(oi.unit_price * oi.qty) filter (where p.kind = 'drink')::int  as revenue_drink
  from order_items oi
  join products p on p.id = oi.product_id
  where not oi.is_free
  group by oi.order_id;

comment on view v_order_revenue_split is
  'إيراد الفاتورة مقسوماً بضاعةً ومشروبات — من أسعار السطور لا من `orders.total`، فالمجموع وحده لا يُقسَم.';

-- ── ٥) ملخّص البضاعة ليومٍ محاسبي ────────────────────────────────────
create or replace function retail_day(p_branch uuid, p_day date default null)
returns jsonb
language sql stable as $$
  with d as (select coalesce(p_day, current_business_day(p_branch)) as day),
  bounds as (
    select business_day_start(p_branch, d.day) as lo,
           business_day_end(p_branch, d.day)   as hi
    from d
  ),
  pack as (
    select coalesce((
      select (s.value #>> '{}')::int from settings s
      join branches br on br.business_id = s.business_id
      where br.id = p_branch and s.key = 'retail_packaging_cost' and s.branch_id is null
    ), 0) as cost
  ),
  sold as (
    select o.id,
           coalesce(rs.revenue_retail, 0) as revenue_retail,
           coalesce(cs.cogs_retail, 0)    as cogs_retail,
           coalesce(cs.has_retail, false) as has_retail,
           coalesce(cs.cost_complete, false) as cost_complete
    from orders o
    cross join bounds b
    left join v_order_cogs_split    cs on cs.order_id = o.id
    left join v_order_revenue_split rs on rs.order_id = o.id
    where o.branch_id = p_branch
      and o.created_at >= b.lo and o.created_at < b.hi
      and o.status not in ('VOIDED', 'CANCELLED', 'DRAFT', 'PENDING_PAYMENT')
  ),
  -- التغليف يُحسب **مرّةً لكل فاتورةٍ فيها بضاعة**، لا لكل صنف
  packed as (select count(*)::int as orders from sold where has_retail)
  select jsonb_build_object(
    'business_day',    (select day from d),
    'orders',          (select orders from packed),
    'units',           coalesce((
                         select sum(oi.qty)::int from order_items oi
                         join products p on p.id = oi.product_id
                         where p.kind = 'retail' and not oi.is_free
                           and oi.order_id in (select id from sold)
                       ), 0),
    'revenue',         (select coalesce(sum(revenue_retail), 0)::int from sold),
    'cogs',            (select coalesce(sum(cogs_retail), 0)::int from sold where cost_complete),
    'packaging_cost',  (select orders from packed) * (select cost from pack),
    'packaging_each',  (select cost from pack),
    'profit',          (select coalesce(sum(revenue_retail), 0)::int from sold where cost_complete)
                       - (select coalesce(sum(cogs_retail), 0)::int from sold where cost_complete)
                       - (select orders from packed) * (select cost from pack),
    'orders_costed',   (select count(*)::int from sold where has_retail and cost_complete)
  );
$$;

comment on function retail_day(uuid, date) is
  'بيع البضاعة ليومٍ محاسبي: كم طلباً وكم قطعة · إيرادها · تكلفتها · وكلفة تغليفها مرّةً لكل طلب. معزولٌ عن المشروبات ليُعرف أيّهما يكسب.';

-- ── ٦) ربح البضاعة على مدى ──────────────────────────────────────────
create or replace function retail_profit(p_business uuid, p_days integer default 30)
returns table(
  product_id uuid, name text,
  units bigint, revenue bigint, cogs bigint, profit bigint, margin_pct numeric
)
language sql stable as $$
  with span as (select greatest(p_days, 1) as d),
  lines as (
    select oi.product_id, p.name, oi.qty, oi.unit_price,
           oi.order_id, oi.crop_material_id
    from order_items oi
    join products p on p.id = oi.product_id
    join orders o on o.id = oi.order_id
    cross join span
    where p.business_id = p_business and p.kind = 'retail'
      and not oi.is_free
      and o.status not in ('VOIDED', 'CANCELLED', 'DRAFT', 'PENDING_PAYMENT')
      and o.created_at >= now() - (span.d || ' days')::interval
  ),
  -- تكلفة السطر من المادة نفسها: البضاعة قطعةٌ لها ثمنٌ معلوم، لا وصفة
  costed as (
    select l.product_id, l.name, l.qty, l.unit_price,
           coalesce(m.current_cost, 0) as unit_cost
    from lines l
    left join materials m on m.id = l.crop_material_id
  )
  select product_id, name,
         sum(qty)::bigint as units,
         sum(unit_price * qty)::bigint as revenue,
         sum(unit_cost  * qty)::bigint as cogs,
         (sum(unit_price * qty) - sum(unit_cost * qty))::bigint as profit,
         case when sum(unit_price * qty) > 0
              then round(100.0 * (sum(unit_price * qty) - sum(unit_cost * qty))
                         / sum(unit_price * qty), 1)
         end as margin_pct
  from costed
  group by product_id, name
  order by profit desc;
$$;

comment on function retail_profit(uuid, integer) is
  'ربح كل صنف بضاعة على مدى أيام — بلا كلفة التغليف، فتلك للطلب لا للصنف.';

-- ── ٧) وسم ما هو قائمٌ الآن ─────────────────────────────────────────
update products set kind = 'retail'
where name like 'كيس بن%' and kind <> 'retail';

update materials set is_retail = true
where name like '%— للبيع' and not is_retail;
