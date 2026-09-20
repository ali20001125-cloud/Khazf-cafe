-- =====================================================================
-- «مشروب موظف» مشروبٌ لا بضاعة
--
-- وجد المالك أنّ الباريستا يستطيع أخذ كيس بنٍّ كمشروب موظف: خمسةٌ
-- وعشرون ألفاً تخرج مجّاناً تحت بند «ضيافة»، والحدّ اليوميّ لا يردعه
-- لأنه يعدّ الأكواب لا أثمانها.
-- =====================================================================
\pset pager off
\set QUIET on

select id as biz    from businesses limit 1 \gset
select id as branch from branches limit 1 \gset
select id as bar    from users where role='barista' limit 1 \gset
select id as own    from users where role='owner' limit 1 \gset
select id as drink  from products where name='أمريكانو' limit 1 \gset
select material_id as crop from product_crops pc
  where pc.product_id=:'drink' and pc.available limit 1 \gset

-- بضاعة: كيس بنّ
insert into materials (business_id, name, base_unit, low_threshold, current_cost, is_retail)
values (:'biz','بن كالدي — للبيع','pcs',5,7500,true) returning id as bag \gset
insert into products (business_id, name, category, kind, sort)
values (:'biz','كيس بن ٢٥٠ غ','other','retail',900) returning id as prod \gset
insert into product_crops (product_id, material_id, price, available) values (:'prod',:'bag',25000,true);
insert into recipes (product_id, version, coffee_grams, active) values (:'prod',1,1,true);

select record_purchase(:'biz',:'branch',:'own',:'bag',20,7500,'شراء');
select record_purchase(:'biz',:'branch',:'own',:'crop',5000,25,'شراء');
insert into inventory_transactions (business_id,branch_id,material_id,type,qty_delta,unit_cost,reason,user_id)
select :'biz',:'branch',id,'PURCHASE',100,150,'رصيد افتتاحي',:'own'
from materials where business_id=:'biz' and base_unit in ('pcs','ml') and not is_retail;

insert into shifts (business_id,branch_id,employee_id,drawer_owner_id,opening_float,status)
values (:'biz',:'branch',:'bar',:'bar',50000,'OPEN') returning id as shift \gset

\echo '=== ١. المشروب يمرّ كما كان ==='
select case when (staff_drink(:'biz',:'branch',:'bar',:'shift',:'drink',:'crop','dine_in',null)
                  ->>'order_number') is not null
            then '✓ أمريكانو مرّ — لم نكسر ما كان يعمل'
            else '❌ المشروب العاديّ توقّف' end as "النتيجة";

\echo ''
\echo '=== ٢. الكيس يُرفض ==='
do $$
declare ok boolean := false;
begin
  begin
    perform staff_drink(
      (select id from businesses limit 1), (select id from branches limit 1),
      (select id from users where role='barista' limit 1),
      (select id from shifts where status='OPEN' limit 1),
      (select id from products where kind='retail' limit 1),
      (select id from materials where is_retail limit 1),
      'dine_in', null);
  exception when others then
    ok := (sqlerrm like '%للبضاعة%');
  end;
  raise notice '%', case when ok
    then '✓ الكيس مرفوض — «مشروبات الموظفين للمشروبات وحدها»'
    else '❌ الكيس مرّ مجّاناً' end;
end $$;

\echo ''
\echo '=== ٣. ولا نقص في مخزون البيع ==='
select case when (select cached_stock from materials where id=:'bag') = 20
            then '✓ رصيد الأكياس ٢٠ كما كان — لم يخرج شيء'
            else format('❌ نقص الرصيد إلى %s', (select cached_stock from materials where id=:'bag'))
       end as "النتيجة";
