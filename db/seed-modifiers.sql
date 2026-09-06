-- =====================================================================
-- بذور أمثلة للخيارات/الإضافات — يعدّلها المالك من اللوحة.
-- =====================================================================
begin;

-- مواد جديدة للإضافات (رصيد افتتاحي عبر الدفتر) --------------------
insert into materials (business_id, name, base_unit, low_threshold, current_cost)
select bs.id, m.name, m.unit::material_unit, m.low, m.cost
from businesses bs
cross join (values
  ('حليب شوفان',  'ml',  2000, 3),
  ('سيروب فانيلا','ml',   300, 5),
  ('سيروب كراميل','ml',   300, 5)
) as m(name, unit, low, cost)
on conflict do nothing;

insert into inventory_transactions (business_id, branch_id, material_id, type, qty_delta, unit_cost, reason, user_id)
select m.business_id, br.id, m.id, 'PURCHASE', v.qty, m.current_cost, 'رصيد افتتاحي', u.id
from (values ('حليب شوفان',6000),('سيروب فانيلا',1000),('سيروب كراميل',1000)) as v(name, qty)
join materials m on m.name = v.name
join branches br on br.business_id = m.business_id
join users u on u.business_id = m.business_id and u.role='owner';

update materials m set cached_stock = t.total
from (select material_id, sum(qty_delta) total from inventory_transactions group by material_id) t
where t.material_id = m.id and m.name in ('حليب شوفان','سيروب فانيلا','سيروب كراميل');

-- مجموعات الخيارات -------------------------------------------------
insert into modifier_groups (business_id, name, selection, required, sort)
select id, 'الحليب', 'single', false, 10 from businesses;
insert into modifier_groups (business_id, name, selection, required, sort)
select id, 'شوت إضافي', 'multi', false, 20 from businesses;
insert into modifier_groups (business_id, name, selection, required, sort)
select id, 'سيروب', 'multi', false, 30 from businesses;

-- خيارات المجموعات --------------------------------------------------
-- الحليب: بقري (أساس) · شوفان (+٥٠٠، يستبدل الحليب)
insert into modifier_options (group_id, name, price_delta, sort)
select g.id, 'بقري', 0, 10 from modifier_groups g where g.name='الحليب';
insert into modifier_options (group_id, name, price_delta, material_id, replaces_base_material_id, sort)
select g.id, 'شوفان', 500,
  (select id from materials where name='حليب شوفان'),
  (select id from materials where name='حليب'), 20
from modifier_groups g where g.name='الحليب';

-- شوت إضافي: +٥٠٠ و +٩غ من المحصول المختار
insert into modifier_options (group_id, name, price_delta, qty, add_to_crop_grams, sort)
select g.id, 'شوت إضافي', 500, 9, true, 10 from modifier_groups g where g.name='شوت إضافي';

-- سيروب: فانيلا/كراميل (+٥٠٠، +١٥مل مادته)
insert into modifier_options (group_id, name, price_delta, material_id, qty, sort)
select g.id, 'فانيلا', 500, (select id from materials where name='سيروب فانيلا'), 15, 10
from modifier_groups g where g.name='سيروب';
insert into modifier_options (group_id, name, price_delta, material_id, qty, sort)
select g.id, 'كراميل', 500, (select id from materials where name='سيروب كراميل'), 15, 20
from modifier_groups g where g.name='سيروب';

-- ربط المجموعات بالمشروبات -----------------------------------------
-- الحليب → مشروبات الحليب
insert into product_modifier_groups (product_id, group_id, sort)
select p.id, g.id, 10
from products p, modifier_groups g
where g.name='الحليب' and p.name in ('لاتيه','كابتشينو','فلات وايت','موكا','آيس لاتيه');

-- شوت إضافي → المشروبات الإسبريسو
insert into product_modifier_groups (product_id, group_id, sort)
select p.id, g.id, 20
from products p, modifier_groups g
where g.name='شوت إضافي' and p.name in ('إسبريسو','دبل إسبريسو','أمريكانو','لاتيه','كابتشينو','فلات وايت','موكا','آيس لاتيه','آيس أمريكانو');

-- سيروب → مشروبات الحليب والموكا
insert into product_modifier_groups (product_id, group_id, sort)
select p.id, g.id, 30
from products p, modifier_groups g
where g.name='سيروب' and p.name in ('لاتيه','كابتشينو','فلات وايت','موكا','آيس لاتيه');

commit;
