-- =====================================================================
-- 0040 · مبيعات كل **نوع** من البضاعة، لا كل صنف
--
-- قال المالك: «مبيعات النوع — قهوة، أدوات، أكواب — تُفصَل بشكلٍ بسيط
-- ولا تتجمّع. كوبٌ كذا باع كذا، والمطحنة كذا نوعٍ باعت كذا عدداً،
-- والقهوة كالدي باعت كذا والأخرى كذا. هذا يفيدني مستقبلاً في تحديد
-- الأنواع المطلوبة والمرغوبة أكثر».
--
-- 0039 جمعت الأنواع تحت صنفها: «كيس بن ٢٥٠ غ — ٣ قطع». وهذا يُخفي
-- بالضبط ما يُشترى من أجله التقرير: **أيّ بنٍّ باع**. من يرى «٣ أكياس»
-- لا يعرف أيطلب كالدي أم سيرادو في شحنته القادمة، فالرقم صحيحٌ وعديم
-- النفع.
--
-- و«المحصول» في هذا النظام هو النوع الذي يختاره الزبون (0039 §١)، فهو
-- الحقل نفسه للبنّ والكوب والأداة. لا تمييز جديد — تجميعٌ أدقّ فقط.
-- =====================================================================

create or replace function retail_variants(p_business uuid, p_days integer default 30)
returns table(
  product_id uuid, product_name text,
  variant_id uuid, variant_name text,
  units bigint, revenue bigint, cogs bigint, profit bigint, margin_pct numeric
)
language sql stable as $$
  with span as (select greatest(p_days, 1) as d),
  lines as (
    select oi.product_id, p.name as product_name,
           oi.crop_material_id as variant_id,
           oi.qty, oi.unit_price,
           coalesce(m.name, 'بلا نوع') as variant_name,
           coalesce(m.current_cost, 0)  as unit_cost
    from order_items oi
    join products p on p.id = oi.product_id
    join orders   o on o.id = oi.order_id
    left join materials m on m.id = oi.crop_material_id
    cross join span
    where p.business_id = p_business and p.kind = 'retail'
      and not oi.is_free
      and o.status not in ('VOIDED', 'CANCELLED', 'DRAFT', 'PENDING_PAYMENT')
      and o.created_at >= now() - (span.d || ' days')::interval
  )
  select product_id, product_name, variant_id, variant_name,
         sum(qty)::bigint                                           as units,
         sum(unit_price * qty)::bigint                              as revenue,
         sum(unit_cost  * qty)::bigint                              as cogs,
         (sum(unit_price * qty) - sum(unit_cost * qty))::bigint     as profit,
         case when sum(unit_price * qty) > 0
              then round(100.0 * (sum(unit_price * qty) - sum(unit_cost * qty))
                         / sum(unit_price * qty), 1)
         end                                                        as margin_pct
  from lines
  group by product_id, product_name, variant_id, variant_name
  -- بالعدد لا بالربح: السؤال هنا «أيّ نوعٍ يُطلب» لا «أيّه يكسب»
  order by product_name, units desc, variant_name;
$$;

comment on function retail_variants(uuid, integer) is
  'مبيعات كل نوعٍ من البضاعة على مدى أيام — كالدي كم باع وسيرادو كم باع، لا «أكياس البنّ» مجموعةً. مرتّبةٌ بالعدد لأن السؤال أيّ نوعٍ يُطلب.';
