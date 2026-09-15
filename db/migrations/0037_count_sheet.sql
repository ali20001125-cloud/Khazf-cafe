-- =====================================================================
-- 0037 · ورقة العدّ: «لماذا المتوقّع هو هذا الرقم؟»
--
-- قال المالك: «نخلي ملاحظة صغيرة أننا اليوم بعنا من هذا المحصول كذا
-- أكواب تساوي كذا كمية، إذن الكمية المتوقّعة كذا — حتى تكون دقيقاً».
--
-- وهو محقّ: شاشة الجرد كانت تعرض رقماً بلا سنده. من يعدّ على رقمٍ لا
-- يعرف من أين جاء لا يستطيع أن يكتشف أنه غلط — لا في الرقم ولا في عدّه.
-- وحين يرى «٢٠ كوباً × ١٨ غ = ٣٦٠ غ» يصير قادراً على مراجعة الاثنين.
--
-- وهذه الأرقام تخدم ثانيةً أهمّ: الفرق المعقول يُقاس على **ما تحرّك منذ
-- آخر عدّة**، لا على نسبةٍ من الرصيد. مقهًى باعَ ٤٠٠ غ لا يمكن أن يفرق
-- جرده ٤٬٨٦٠ غ مهما كان الرصيد كبيراً. فالحركة هي المسطرة.
-- =====================================================================

create or replace function count_sheet(p_branch_id uuid)
returns table (
  material_id   uuid,
  name          text,
  base_unit     material_unit,
  expected      integer,
  last_count_at timestamptz,
  sold          integer,   -- ما خصمه البيع منذ آخر عدّة
  cups          integer,   -- كم كوباً (لا ينطبق على الحليب والأكواب — يُجمع كما هو)
  wasted        integer,
  staff         integer,
  purchased     integer
)
language sql stable as $$
  with last_count as (
    -- آخر عدّةٍ لكل مادة: هي نقطة الصفر التي يُقاس عليها ما بعدها
    select i.material_id, max(c.created_at) as at
    from stock_counts c
    join stock_count_items i on i.count_id = c.id
    where c.branch_id = p_branch_id
    group by i.material_id
  ),
  moves as (
    select t.material_id,
           sum(-t.qty_delta) filter (where t.type = 'SALE')::int     as sold,
           sum(-t.qty_delta) filter (where t.type = 'WASTE')::int    as wasted,
           sum(-t.qty_delta) filter (where t.type = 'STAFF')::int    as staff,
           sum(t.qty_delta)  filter (where t.type = 'PURCHASE')::int as purchased
    from inventory_transactions t
    left join last_count lc on lc.material_id = t.material_id
    where t.branch_id = p_branch_id
      and (lc.at is null or t.created_at > lc.at)
    group by t.material_id
  ),
  sold_cups as (
    -- الأكواب تُحسب من المحصول المختار في الفاتورة، فهي تخصّ الحبوب وحدها
    select oi.crop_material_id as material_id, sum(oi.qty)::int as cups
    from order_items oi
    join orders o on o.id = oi.order_id
    left join last_count lc on lc.material_id = oi.crop_material_id
    where o.branch_id = p_branch_id
      and o.status not in ('VOIDED', 'CANCELLED')
      and (lc.at is null or o.created_at > lc.at)
      and oi.crop_material_id is not null
    group by oi.crop_material_id
  )
  select m.id, m.name, m.base_unit, m.cached_stock,
         lc.at,
         coalesce(mv.sold, 0), coalesce(sc.cups, 0),
         coalesce(mv.wasted, 0), coalesce(mv.staff, 0), coalesce(mv.purchased, 0)
  from materials m
  left join last_count lc on lc.material_id = m.id
  left join moves     mv on mv.material_id = m.id
  left join sold_cups sc on sc.material_id = m.id
  where m.active
  order by m.base_unit, m.name;
$$;

comment on function count_sheet(uuid) is
  'ورقة العدّ: الرصيد المتوقّع ومعه سنده — ما بيع وأُهدر وشُرب واشتُري منذ آخر عدّة. الحركة هي مسطرة الفرق المعقول، لا نسبةٌ من الرصيد.';
