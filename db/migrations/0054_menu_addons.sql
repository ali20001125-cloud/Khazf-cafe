-- الإضافات في منيو الزبون: الحليب النباتي، والنكهة، والشوت الإضافي.
--
-- قال المالك: «وين إضافة الحليب؟ إضافة نكهة؟ النكهات داخل المشروب
-- خلّيها أوضح». كانت الخيارات في الكاشير وحده، والمنيو يقول عن النكهة
-- سطراً مدسوساً تحت اللاتيه — فمن لا يقرأ السطر لا يعرف أنها موجودة،
-- ومن يريد حليب شوفان لا يعرف كم يزيد.
--
-- فللمجموعة اسمٌ على الطاولة غير اسمها في الكاشير («سيروب» عند
-- الباريستا، «نكهة» عند الزبون)، ولكلٍّ منهما اسمٌ إنجليزي.

alter table modifier_groups
  add column if not exists menu_name text,
  add column if not exists name_en text;
alter table modifier_options
  add column if not exists name_en text;

comment on column modifier_groups.menu_name is
  'اسم المجموعة كما يراه الزبون في المنيو. فارغٌ يعني اسمها في الكاشير.';

update modifier_groups set menu_name = coalesce(menu_name, 'حليب نباتي'), name_en = coalesce(name_en, 'Plant milk')
 where name = 'الحليب';
update modifier_groups set menu_name = coalesce(menu_name, 'نكهة'), name_en = coalesce(name_en, 'Flavour')
 where name = 'سيروب';
update modifier_groups set name_en = coalesce(name_en, 'Extra shot')
 where name = 'شوت إضافي';

update modifier_options set name_en = coalesce(name_en, v.en)
  from (values ('شوفان', 'Oat'), ('فانيلا', 'Vanilla'), ('كاراميل', 'Caramel'),
               ('شوت إضافي', 'Extra shot'), ('بقري', 'Regular')) as v(ar, en)
 where modifier_options.name = v.ar;

-- السطر المدسوس يُرفع: صار للنكهة مكانها الواضح في البطاقة
update products set menu_note = null, menu_note_en = null
 where menu_note = 'يتوفّر منكّهاً: فانيلا أو كاراميل (+٥٠٠)';
