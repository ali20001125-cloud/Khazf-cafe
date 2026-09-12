-- =====================================================================
-- 0024 · الربح: التكلفة تُختم لحظة البيع
--
-- ما كان ناقصاً: `inventory_transactions.unit_cost` يُملأ في `PURCHASE`
-- فقط. صفوف `SALE` و`STAFF` و`WASTE` كلّها فارغة التكلفة — فلا يعرف
-- النظام كم كلّفه ما باعه، ويعرف الإيراد وحده.
--
-- ولماذا لا نحسب التكلفة وقت العرض من `materials.current_cost`؟ لأن تلك
-- تكلفة **اليوم**، لا تكلفة يوم البيع. فلو غلا كيلو القهوة الشهر القادم
-- لتغيّر «ربح الشهر الماضي» معه — تقريرٌ يتبدّل بعد أن قُرئ لا يُبنى عليه
-- قرار. التكلفة واقعةٌ حدثت مرّة، فتُختم مرّة.
--
-- فمُشغّلٌ يختم التكلفة على كل حركة استهلاك لحظة كتابتها. ولأن الدفتر
-- للإلحاق فقط (0011)، ما خُتم لا يتغيّر — وهذا هو المطلوب بالضبط.
--
-- الصفوف القديمة (٣١ بيعاً من أسبوع التجربة) تبقى **فارغة التكلفة عن
-- قصد**. لا نعرف تكلفتها الحقيقية يومها، واختراع رقم لها أسوأ من الإقرار
-- بجهله: التقارير تعرض تغطيةَ التكلفة صراحةً، والربح الدقيق يبدأ من اليوم.
-- =====================================================================

-- ── ختم التكلفة ──────────────────────────────────────────────────────
create or replace function khazaf_stamp_cost() returns trigger
language plpgsql as $fn$
begin
  -- الشراء يأتي بتكلفته من الفاتورة، والجرد تسويةُ كمّية لا حركة تكلفة
  if new.unit_cost is null
     and new.type in ('SALE', 'STAFF', 'LOYALTY_REWARD', 'WASTE', 'TRANSFER_OUT')
  then
    select m.current_cost into new.unit_cost
    from materials m where m.id = new.material_id;
  end if;
  return new;
end;
$fn$;

comment on function khazaf_stamp_cost() is
  'يختم تكلفة الوحدة لحظة الاستهلاك. التكلفة واقعة حدثت مرّة، فلا تُحسب لاحقاً من سعر اليوم.';

drop trigger if exists inv_txn_stamp_cost on inventory_transactions;
create trigger inv_txn_stamp_cost
  before insert on inventory_transactions
  for each row execute function khazaf_stamp_cost();

-- ── تكلفة كل فاتورة ──────────────────────────────────────────────────
create or replace view v_order_cogs as
  select t.order_id,
         sum(-t.qty_delta * coalesce(t.unit_cost, 0))::int as cogs,
         -- هل كل مواد هذه الفاتورة مختومة التكلفة؟ فاتورةٌ ناقصة الختم
         -- تُستثنى من حساب الربح بدل أن تُنقصه بصمت.
         bool_and(t.unit_cost is not null) as cost_complete
  from inventory_transactions t
  where t.order_id is not null and t.type in ('SALE', 'STAFF', 'LOYALTY_REWARD')
  group by t.order_id;

comment on view v_order_cogs is
  'تكلفة مواد كل فاتورة من الدفتر بتكلفة يوم البيع. `cost_complete` كاذب = لا تُحسب في الربح.';

-- ── ربح اليوم المحاسبي ───────────────────────────────────────────────
create or replace function day_profit(p_branch uuid, p_day date default null)
returns jsonb
language sql stable as $$
  with d as (select coalesce(p_day, current_business_day(p_branch)) as day),
  bounds as (
    select business_day_start(p_branch, d.day) as lo,
           business_day_end(p_branch, d.day)   as hi
    from d
  ),
  sold as (
    -- البيع الحقيقي فقط: الملغى والمُلغى قبل الدفع خارج كل حساب
    select o.id, o.total,
           coalesce(c.cogs, 0) as cogs,
           coalesce(c.cost_complete, false) as cost_complete,
           o.order_type::text as order_type
    from orders o
    cross join bounds b
    left join v_order_cogs c on c.order_id = o.id
    where o.branch_id = p_branch
      and o.created_at >= b.lo and o.created_at < b.hi
      and o.status not in ('VOIDED', 'CANCELLED', 'DRAFT', 'PENDING_PAYMENT')
  ),
  refunded as (
    select coalesce(sum(r.amount), 0)::int as amount
    from refunds r cross join bounds b
    where r.branch_id = p_branch and r.status = 'COMPLETED'
      and r.created_at >= b.lo and r.created_at < b.hi
  ),
  waste as (
    -- الهدر تكلفةُ يومٍ لا تكلفةَ فاتورة: قهوة خرجت ولم تُبَع
    select coalesce(sum(-t.qty_delta * coalesce(t.unit_cost, 0)), 0)::int as cost
    from inventory_transactions t cross join bounds b
    where t.branch_id = p_branch and t.type = 'WASTE'
      and t.created_at >= b.lo and t.created_at < b.hi
  )
  select jsonb_build_object(
    'business_day',   (select day from d),
    'orders',         (select count(*) from sold where order_type = 'SALE'),
    -- الإيراد صافياً بعد الإرجاعات: ما دخل الصندوق وبقي فيه
    'revenue',        (select coalesce(sum(total), 0)::int from sold) - (select amount from refunded),
    'refunds',        (select amount from refunded),
    -- تكلفة ما بيع + تكلفة ما شُرب مجاناً (موظفين ومكافآت) — كلّه خرج من المخزون
    -- التكلفة والربح يُحسبان على الفواتير **المختومة التكلفة وحدها**. فاتورةٌ
    -- بلا تكلفة تُساهم بصفر، ولو جمعناها لظهر هامش ١٠٠٪ — وهو كذبٌ صريح
    -- أسوأ من الإقرار بالجهل. فتُستثنى، ويُعلَن عددها.
    'cogs',           (select coalesce(sum(cogs), 0)::int from sold where cost_complete),
    'cogs_sales',     (select coalesce(sum(cogs), 0)::int from sold where cost_complete and order_type = 'SALE'),
    'cogs_free',      (select coalesce(sum(cogs), 0)::int from sold where cost_complete and order_type <> 'SALE'),
    -- إيراد الفواتير المختومة: هو وحده ما يُطرح منه `cogs` ليصحّ الربح
    'revenue_costed', (select coalesce(sum(total), 0)::int from sold where cost_complete and order_type = 'SALE'),
    'waste_cost',     (select cost from waste),
    'free_drinks',    (select count(*) from sold where order_type <> 'SALE'),
    -- التغطية: كم فاتورة تكلفتها مختومة كاملةً. أقلّ من ١٠٠٪ يعني أن الربح
    -- المعروض أدنى حدّ لا رقماً نهائياً، والشاشة تقول ذلك.
    'orders_costed',  (select count(*) from sold where cost_complete),
    'orders_total',   (select count(*) from sold)
  );
$$;

comment on function day_profit(uuid, date) is
  'ربح يوم محاسبي: إيراد صافٍ · تكلفة المبيع · تكلفة المجاني · تكلفة الهدر · وتغطية الختم.';

-- ── ربح كل مشروب ─────────────────────────────────────────────────────
drop function if exists product_profit(uuid, integer);
create or replace function product_profit(p_business uuid, p_days integer default 30)
returns table(
  product_id uuid, name text,
  cups integer, revenue bigint, cogs bigint, profit bigint,
  margin_pct numeric, profit_per_cup integer, costed_cups integer
)
language sql stable as $$
  with span as (select greatest(p_days, 1) as d),
  lines as (
    select oi.product_id, p.name, oi.qty, oi.unit_price, oi.order_id,
           o.order_type::text as order_type
    from order_items oi
    join orders o on o.id = oi.order_id
    join products p on p.id = oi.product_id
    cross join span
    where o.business_id = p_business
      and o.status not in ('VOIDED', 'CANCELLED', 'DRAFT', 'PENDING_PAYMENT')
      and o.created_at >= now() - make_interval(days => span.d)
  ),
  -- تكلفة الفاتورة تُوزَّع على أكوابها: فاتورة فيها لاتيه وإسبريسو لا
  -- تُحمَّل كلّها على أحدهما. التوزيع بالنسبة للسعر — أقرب تقدير متاح
  -- بلا ربط كل حركة مخزون ببندها.
  shares as (
    select l.product_id, l.name, l.qty, l.unit_price, l.order_type,
           c.cogs, c.cost_complete,
           (l.qty * l.unit_price)::numeric
             / nullif(sum(l.qty * l.unit_price) over (partition by l.order_id), 0) as share
    from lines l
    left join v_order_cogs c on c.order_id = l.order_id
  )
  -- كل رقم مالٍ يُحسب على الأكواب المختومة التكلفة فقط، ويكون **فارغاً**
  -- إذا لم يكن فيها كوب واحد مختوم. الفراغ يُعرض «—»، وهو أصدق من ١٠٠٪.
  -- و`cups` يبقى العدد الكامل لأنه واقعةٌ نعرفها: بيعت فعلاً.
  select s.product_id, s.name,
         sum(s.qty)::int as cups,
         nullif(sum(case when s.cost_complete and s.order_type = 'SALE'
                         then s.qty * s.unit_price else 0 end), 0)::bigint as revenue,
         case when bool_or(s.cost_complete)
              then round(sum(case when s.cost_complete
                                  then coalesce(s.cogs, 0) * coalesce(s.share, 0) else 0 end))::bigint
         end as cogs,
         case when bool_or(s.cost_complete)
              then (sum(case when s.cost_complete and s.order_type = 'SALE'
                             then s.qty * s.unit_price else 0 end)
                    - round(sum(case when s.cost_complete
                                     then coalesce(s.cogs, 0) * coalesce(s.share, 0) else 0 end)))::bigint
         end as profit,
         case when sum(case when s.cost_complete and s.order_type = 'SALE'
                            then s.qty * s.unit_price else 0 end) > 0
              then round(100.0 * (sum(case when s.cost_complete and s.order_type = 'SALE'
                                           then s.qty * s.unit_price else 0 end)
                                  - sum(case when s.cost_complete
                                             then coalesce(s.cogs, 0) * coalesce(s.share, 0) else 0 end))
                         / sum(case when s.cost_complete and s.order_type = 'SALE'
                                    then s.qty * s.unit_price else 0 end), 1)
         end as margin_pct,
         case when sum(case when s.cost_complete then s.qty else 0 end) > 0
              then round((sum(case when s.cost_complete and s.order_type = 'SALE'
                                   then s.qty * s.unit_price else 0 end)
                          - sum(case when s.cost_complete
                                     then coalesce(s.cogs, 0) * coalesce(s.share, 0) else 0 end))
                         / sum(case when s.cost_complete then s.qty else 0 end))::int
         end as profit_per_cup,
         sum(case when s.cost_complete then s.qty else 0 end)::int as costed_cups
  from shares s
  group by s.product_id, s.name
  order by profit desc nulls last;
$$;

comment on function product_profit(uuid, integer) is
  'ربح كل مشروب خلال مدّة. تكلفة الفاتورة تُوزَّع على أكوابها بنسبة السعر.';
