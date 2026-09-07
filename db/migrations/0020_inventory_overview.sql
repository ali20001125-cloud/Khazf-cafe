-- =====================================================================
-- 0020 — نظرة المخزون كما يفكّر بها صاحب المقهى
--
-- السؤال الذي يسأله المالك ليس «كم الرصيد؟» بل:
--   • كم بقي من **كل محصول** على حدة؟ (٥ كيلو قد تكون خمسة محاصيل)
--   • كم أستهلك في اليوم؟
--   • **كم يوماً يكفيني** هذا المخزون؟  ← هذا ما يحدّد متى يشتري
--   • ماذا جرى عليه؟ (٥ كيلو → بعنا ١٫٥ → بقي ٣٫٥ → أضفت ١)
--
-- الرصيد تراكمي دائماً: كل حركة تُضاف للسابقة، والدفتر يحفظ السلسلة.
-- =====================================================================

create or replace function material_overview(p_business_id uuid, p_days integer default 30)
returns table (
  id uuid,
  name text,
  base_unit material_unit,
  stock int,
  low_threshold int,
  current_cost int,
  stock_value bigint,
  is_crop boolean,
  used_in text,
  consumed_period int,
  avg_per_day numeric,
  days_left numeric
)
language sql stable as $$
  with span as (select greatest(p_days, 1) as d),
  consumption as (
    select t.material_id,
           -sum(t.qty_delta)::int as consumed
    from inventory_transactions t, span
    where t.type in ('SALE','LOYALTY_REWARD','STAFF','WASTE')
      and t.created_at >= now() - make_interval(days => span.d)
    group by t.material_id
  ),
  crops as (
    -- المادة «محصول» إذا كانت تُباع كحبوب لمشروب
    select pc.material_id,
           string_agg(distinct p.name, ' · ' order by p.name) as used_in
    from product_crops pc
    join products p on p.id = pc.product_id and p.active
    where pc.available
    group by pc.material_id
  )
  select m.id, m.name, m.base_unit, m.cached_stock as stock,
         m.low_threshold, m.current_cost,
         (m.cached_stock::bigint * m.current_cost) as stock_value,
         (c.material_id is not null) as is_crop,
         coalesce(c.used_in, '') as used_in,
         coalesce(cons.consumed, 0) as consumed_period,
         round(coalesce(cons.consumed, 0)::numeric / (select d from span), 1) as avg_per_day,
         case
           when coalesce(cons.consumed, 0) <= 0 then null
           else round(m.cached_stock::numeric
                      / (coalesce(cons.consumed, 0)::numeric / (select d from span)), 0)
         end as days_left
  from materials m
  left join crops c on c.material_id = m.id
  left join consumption cons on cons.material_id = m.id
  where m.business_id = p_business_id and m.active
  order by (c.material_id is not null) desc, m.name;
$$;

comment on function material_overview(uuid, integer) is
  'نظرة المخزون: الرصيد التراكمي لكل مادة، وهل هي محصول قهوة وأي مشروبات تستعمله، ومعدّل الاستهلاك اليومي، وكم يوماً يكفي — أساس قرار «متى أشتري».';
