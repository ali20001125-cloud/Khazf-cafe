-- المكوّنات في المنيو: أسماءٌ بلا كميّات.
--
-- قال المالك: «لا تكتب كمية الحليب في المشروبات، بل حليب. مبخّر.
-- وهكذا». كانت بطاقة المشروب تعرض سطور الوصفة كما هي — «حليب ١٨٠ مل»،
-- «حبوب قهوة مختصّة ١٨ غ». وتلك لغة المخزن لا لغة الطاولة.
--
-- فالسطر يُكتب هنا ويُعدَّل من «المنيو». والوصفة تبقى على حالها: منها
-- يُخصم المخزون وتُحسب السعرات، ولا يراها الزبون.
--
-- والبذور أدناه تُكتب فقط حيث الحقل فارغ، فتعديل المالك لا يُمحى إن
-- أُعيد تشغيل الملفّ.

alter table products
  add column if not exists menu_ingredients text,
  add column if not exists menu_ingredients_en text;

comment on column products.menu_ingredients is
  'مكوّنات المشروب كما تُقال للزبون، مفصولةً بـ «·» — بلا كميّات. فارغٌ يعني: أسماء الوصفة.';

update products p set
  menu_ingredients    = v.ar,
  menu_ingredients_en = coalesce(p.menu_ingredients_en, v.en)
from (values
  ('إسبريسو',          'إسبريسو دبل',                                   'Double espresso'),
  ('كورتادو',          'إسبريسو · حليب مبخّر',                           'Espresso · Steamed milk'),
  ('أمريكانو',         'إسبريسو · ماء ساخن',                             'Espresso · Hot water'),
  ('لاتيه',            'إسبريسو · حليب مبخّر · رغوة خفيفة',              'Espresso · Steamed milk · Light foam'),
  ('سبانش لاتيه',      'إسبريسو · حليب مبخّر · حليب مكثّف',              'Espresso · Steamed milk · Condensed milk'),
  ('كابتشينو',         'إسبريسو · حليب مبخّر · رغوة كثيفة',              'Espresso · Steamed milk · Thick foam'),
  ('فلات وايت',        'إسبريسو · حليب مبخّر ناعم',                      'Espresso · Velvety steamed milk'),
  ('موكا',             'إسبريسو · شوكولاتة · حليب مبخّر',                'Espresso · Chocolate · Steamed milk'),
  ('آيس لاتيه',        'إسبريسو · حليب بارد · ثلج',                      'Espresso · Cold milk · Ice'),
  ('آيس سبانش',        'إسبريسو · حليب بارد · حليب مكثّف · ثلج',          'Espresso · Cold milk · Condensed milk · Ice'),
  ('آيس موكا',         'إسبريسو · شوكولاتة · حليب بارد · ثلج',            'Espresso · Chocolate · Cold milk · Ice'),
  ('آيس أمريكانو',     'إسبريسو · ماء بارد · ثلج',                       'Espresso · Cold water · Ice'),
  ('قهوة اليوم',       'قهوة مقطّرة',                                    'Filter coffee'),
  ('قهوة اليوم باردة', 'قهوة مقطّرة · ثلج',                              'Filter coffee · Ice'),
  ('في٦٠',             'قهوة مقطّرة يدوياً',                              'Hand-brewed filter coffee'),
  ('تقطير',            'قهوة مقطّرة',                                    'Filter coffee')
) as v(name, ar, en)
where p.name = v.name and p.kind = 'drink' and p.active and p.menu_ingredients is null;
