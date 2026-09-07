-- =====================================================================
-- 0019 — لكل إعداد بيت واحد
--
-- المشكلة: ثلاثة إعدادات صار لها مكانان، وهذا يعني أن المالك قد يغيّر
-- واحداً بينما يقرأ النظام الآخر:
--   • الفكّة القياسية: `settings.standard_float` و`branches.standard_float`
--   • عتبة فرق الجرد: `settings.variance_thresholds` و`branches.variance_threshold_pct`
--   • ساعة بداية اليوم: جديدة على `branches` بلا مقابل
--
-- القاعدة المعتمدة: **ما يخصّ الفرع يعيش على `branches`** — لأن الفرع
-- الثاني (مستقبلاً) قد تختلف فكّته وساعة بدايته. و`settings` تبقى
-- لما يخصّ العمل كلّه: اسم المحل، هاتفه، حدّ مشروبات الموظف.
--
-- الهجرة تنقل القيم الحالية ثم تحذف المكرّرة — لا يضيع ما ضبطه المالك.
-- =====================================================================

-- ── نقل الفكّة القياسية من الإعدادات إلى الفرع ──────────────────────
update branches b
   set standard_float = coalesce(
     (select (s.value #>> '{}')::integer
        from settings s
       where s.business_id = b.business_id and s.branch_id is null
         and s.key = 'standard_float'
         and jsonb_typeof(s.value) = 'number'),
     b.standard_float
   )
 where b.standard_float = 0
    or exists (select 1 from settings s
                where s.business_id = b.business_id and s.branch_id is null
                  and s.key = 'standard_float');

-- ── نقل عتبة الفرق (كانت green/amber؛ نأخذ green كعتبة التنبيه) ─────
update branches b
   set variance_threshold_pct = coalesce(
     (select (s.value ->> 'green')::numeric
        from settings s
       where s.business_id = b.business_id and s.branch_id is null
         and s.key = 'variance_thresholds'
         and jsonb_typeof(s.value) = 'object'
         and (s.value ? 'green')),
     b.variance_threshold_pct
   );

-- ── حذف المكرّر والمهجور ────────────────────────────────────────────
-- standard_float · variance_thresholds : انتقلا إلى `branches`.
-- low_stock_alert : لم يقرأه شيء — حدّ التنبيه لكل مادة في materials.low_threshold.
-- extra_shot_price · shot_grams : لا يوجد شوت إضافي (قرار المالك، هجرة 0018).
delete from settings
 where branch_id is null
   and key in ('standard_float', 'variance_thresholds', 'low_stock_alert',
               'extra_shot_price', 'shot_grams');

comment on column branches.standard_float is
  'الفكّة الافتتاحية القياسية. **يضعها المالك وحده** — الباريستا يؤكّد وجودها ولا يُدخل الرقم، لأن من يُحاسَب على الدرج لا يضع الرقم الذي يُقاس عليه.';
