-- =====================================================================
-- 0018 — إزالة «الشوت الإضافي» (قرار المالك: لا يوجد شوت إضافي)
--
-- لا تُحذف الصفوف: الفواتير القديمة قد تشير إليها عبر
-- `order_item_modifiers.option_id`، وحذفها يكسر تاريخاً مدفوعاً. تُعطَّل
-- فقط (`available = false` · `active = false`) فتختفي من شاشة البيع
-- ويبقى ما بيع بها مقروءاً كما كان.
-- =====================================================================

update modifier_options o
   set available = false
  from modifier_groups g
 where g.id = o.group_id and g.name = 'شوت إضافي';

update modifier_groups set active = false where name = 'شوت إضافي';

delete from settings where key in ('extra_shot_price', 'shot_grams');
