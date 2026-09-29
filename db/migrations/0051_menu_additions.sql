-- قائمة المالك الجديدة: ما لم يكن في الكتالوج.
--
-- كورتادو · سبانش لاتيه · آيس سبانش · آيس موكا · قهوة اليوم (حارّة
-- وباردة) · ماء.
--
-- واللاتيه المنكّه ليس منتجاً هنا عمداً: هو لاتيه (٤٥٠٠) + سيروب
-- (٥٠٠) = ٥٠٠٠، سعر القائمة نفسه. مشروبٌ مستقلّ بوصفةٍ ثابتة لا يعرف
-- أيّ نكهةٍ طُلبت، فيخصم فانيلا والزبون أخذ كاراميل.
--
-- **الوصفات تقدير أوّل** على نسق الموجود (١٨ غ للحليبي، ١٥ غ لقهوة
-- اليوم). تُعدَّل من «المشروبات والوصفات»، وتعديلها يصنع نسخةً جديدة
-- فلا يتغيّر حساب ما بيع قبلها.
--
-- **والماء بلا مخزون** — قال المالك: «فقط بالقائمة، إن باع احسبه».
-- كل منتجٍ يُسعَّر عبر «محصول» (`product_crops`)، فللماء مادّةٌ تحمل
-- سعره ولا شيء غيره: `active = false` فلا تظهر في المخزون ولا في
-- تنبيهاته ولا في قائمة الشراء، ووصفته صفر غرام بلا مكوّنات فلا يُخصم
-- شيءٌ عند البيع. والكاشير يراه متاحاً دائماً (`catalog.ts`).
-- ووسم المنيو «٥٠٠ مل» يُعرض تحت الاسم مكان اسم البنّ.

do $$
declare
  v_biz uuid;
  v_serrado uuid; v_dorado uuid; v_kaldi uuid;
  v_milk uuid; v_condensed uuid; v_water uuid;
  v_pcup uuid; v_plid uuid; v_scup uuid; v_slid uuid;
  v_g_milk uuid; v_g_syrup uuid; v_g_shot uuid;
  r record;
  v_pid uuid; v_rid uuid;
begin
  select id into v_biz from businesses order by created_at limit 1;
  if v_biz is null then return; end if;

  select id into v_serrado from materials where business_id = v_biz and name = 'حبوب سيرادو';
  select id into v_dorado  from materials where business_id = v_biz and name = 'حبوب الدورادو';
  select id into v_kaldi   from materials where business_id = v_biz and name = 'حبوب كالدي';
  select id into v_milk    from materials where business_id = v_biz and name = 'حليب';
  select id into v_pcup    from materials where business_id = v_biz and name = 'كوب ورقي';
  select id into v_plid    from materials where business_id = v_biz and name = 'غطاء ورقي';
  select id into v_scup    from materials where business_id = v_biz and name = 'كوب بلاستك';
  select id into v_slid    from materials where business_id = v_biz and name = 'غطاء بلاستك';
  select id into v_g_milk  from modifier_groups where business_id = v_biz and name = 'الحليب';
  select id into v_g_syrup from modifier_groups where business_id = v_biz and name = 'سيروب';
  select id into v_g_shot  from modifier_groups where business_id = v_biz and name = 'شوت إضافي';

  -- كتالوجٌ غير كتالوج خزف (قاعدة اختبار فارغة): لا شيء يُزرع
  if v_serrado is null or v_milk is null or v_pcup is null or v_scup is null then return; end if;

  -- الحليب المكثّف: مادّةٌ جديدة بلا تكلفة بعد — يظهر تنبيه «مادّة بلا
  -- تكلفة» حتى يُسجَّل أوّل شراء، وهذا مقصود.
  select id into v_condensed from materials where business_id = v_biz and name = 'حليب مكثّف';
  if v_condensed is null then
    insert into materials (business_id, name, base_unit, low_threshold, current_cost, menu_label_en)
    values (v_biz, 'حليب مكثّف', 'ml', 300, 0, 'Condensed milk')
    returning id into v_condensed;
  end if;

  select id into v_water from materials where business_id = v_biz and name = 'ماء ٥٠٠ مل';
  if v_water is null then
    insert into materials (business_id, name, base_unit, low_threshold, current_cost,
                           active, menu_label, menu_label_en)
    values (v_biz, 'ماء ٥٠٠ مل', 'pcs', 0, 0, false, '٥٠٠ مل', '500 ml')
    returning id into v_water;
  end if;

  for r in
    select * from (values
      -- name, name_en, category, sort, grams, price, crops, milk, condensed, cup, groups
      ('كورتادو',          'Cortado',               'espresso', 15,  18, 3500, 'serrado',     60, 0,  'paper',   'milk,shot'),
      ('سبانش لاتيه',      'Spanish Latte',         'hot',      45,  18, 5000, 'serrado',    150, 30, 'paper',   'milk,shot'),
      ('آيس سبانش',        'Iced Spanish Latte',    'cold',     85,  18, 5000, 'serrado',    170, 30, 'plastic', 'milk,shot'),
      ('آيس موكا',         'Iced Mocha',            'cold',     87,  18, 5000, 'serrado',    200, 0,  'plastic', 'milk,syrup,shot'),
      ('قهوة اليوم',       'Coffee of the Day',     'filter',   95,  15, 3000, 'filter',       0, 0,  'paper',   ''),
      ('قهوة اليوم باردة', 'Iced Coffee of the Day','cold',     96,  15, 3000, 'filter',       0, 0,  'plastic', ''),
      ('ماء',              'Water',                 'other',   200,   0,  250, 'water',        0, 0,  'none',    '')
    ) as t(name, name_en, category, sort, grams, price, crops, milk, condensed, cup, groups)
  loop
    if exists (select 1 from products where business_id = v_biz and name = r.name and active) then
      continue;
    end if;

    insert into products (business_id, name, name_en, category, sort)
    values (v_biz, r.name, r.name_en, r.category, r.sort)
    returning id into v_pid;

    if r.crops = 'serrado' then
      insert into product_crops (product_id, material_id, price, available) values (v_pid, v_serrado, r.price, true);
    elsif r.crops = 'filter' then
      -- بنّ الفلتر المتاح اليوم في في٦٠: الدورادو وكالدي
      if v_dorado is not null then
        insert into product_crops (product_id, material_id, price, available) values (v_pid, v_dorado, r.price, true);
      end if;
      if v_kaldi is not null then
        insert into product_crops (product_id, material_id, price, available) values (v_pid, v_kaldi, r.price, true);
      end if;
    elsif r.crops = 'water' then
      insert into product_crops (product_id, material_id, price, available) values (v_pid, v_water, r.price, true);
    end if;

    insert into recipes (product_id, version, coffee_grams, active)
    values (v_pid, 1, r.grams, true)
    returning id into v_rid;

    if r.milk > 0 then
      insert into recipe_items (recipe_id, material_id, qty, only_takeaway) values (v_rid, v_milk, r.milk, false);
    end if;
    if r.condensed > 0 then
      insert into recipe_items (recipe_id, material_id, qty, only_takeaway) values (v_rid, v_condensed, r.condensed, false);
    end if;
    if r.cup = 'paper' then
      insert into recipe_items (recipe_id, material_id, qty, only_takeaway) values (v_rid, v_pcup, 1, true);
      if v_plid is not null then
        insert into recipe_items (recipe_id, material_id, qty, only_takeaway) values (v_rid, v_plid, 1, true);
      end if;
    elsif r.cup = 'plastic' then
      insert into recipe_items (recipe_id, material_id, qty, only_takeaway) values (v_rid, v_scup, 1, true);
      if v_slid is not null then
        insert into recipe_items (recipe_id, material_id, qty, only_takeaway) values (v_rid, v_slid, 1, true);
      end if;
    end if;

    if position('milk' in r.groups) > 0 and v_g_milk is not null then
      insert into product_modifier_groups (product_id, group_id) values (v_pid, v_g_milk);
    end if;
    if position('syrup' in r.groups) > 0 and v_g_syrup is not null then
      insert into product_modifier_groups (product_id, group_id) values (v_pid, v_g_syrup);
    end if;
    if position('shot' in r.groups) > 0 and v_g_shot is not null then
      insert into product_modifier_groups (product_id, group_id) values (v_pid, v_g_shot);
    end if;
  end loop;

  -- المنكّه يُطلب من اللاتيه نفسه — فالزبون يُقال له ذلك في المنيو
  update products set
    menu_note    = coalesce(menu_note,    'يتوفّر منكّهاً: فانيلا أو كاراميل (+٥٠٠)'),
    menu_note_en = coalesce(menu_note_en, 'Also flavoured: vanilla or caramel (+500)')
  where business_id = v_biz and active and name in ('لاتيه', 'آيس لاتيه');
end $$;
