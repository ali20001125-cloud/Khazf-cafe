-- =====================================================================
-- 0022 · الجرعة تُشتقّ من الوصفة — لا تُكتب باليد ولا تبقى فارغة
--
-- المشكلة التي كشفتها محاكاة اليومين (db/tests/11_two_days.sql):
-- سُرقت ثلاثة مشروبات، فنقص ٥٤غ حبوب و٥٤٠مل حليب. المخزون كبير، فظهر
-- النقص هكذا:
--
--     حبوب الدورادو   −٥٤    −٠٫٦٠٪   ≈ جرعة: (فارغ)   within_threshold
--     حليب            −٥٤٠   −٣٫٠١٪   ≈ جرعة: (فارغ)   within_threshold
--
-- أي أن **ثلاثة مشروبات مسروقة ظهرت باللون الهادئ**. سببان:
--
-- ١) عمود `materials.dose_grams` أُضيف في ٠٠١١ ولم يُملأ لأي مادة حقيقية،
--    فبقي عمود «≈ جرعة» فارغاً — وهو العمود الوحيد الذي يترجم النسبة إلى
--    لغة يفهمها صاحب المقهى: «كم مشروباً ضاع؟».
--    الحلّ: لا نطلب من أحد تعبئته. الوصفة تعرف الجرعة أصلاً — ١٨غ للاتيه،
--    ١٨٠مل حليب — فنشتقّها منها. يبقى العمود متاحاً كتجاوز يدوي لمادة لا
--    وصفة لها (سكّر، مناديل)، فإن كُتب فهو الأرجح.
--
-- ٢) المستوى كان يُقرَّر بالنسبة المئوية وحدها، والنسبة تصغر كلما كبر
--    المخزون: خمسة كيلو تُخفي مشروباً كاملاً داخل ٠٫٦٪. فأضفنا اختباراً
--    ثانياً مستقلاً: **نقص يعادل مشروبين فأكثر أحمر مهما صغرت نسبته**.
--
--    ولماذا مشروبان لا مشروب واحد؟ لأن مشروباً واحداً يقع بالخطأ فعلاً —
--    صبّة زائدة، ميزان يزيغ. ومن يسرق مشروباً كل يوم لا يفلت: يلتقطه
--    `v_repeated_variance` (ثلاث مرات في ٣٠ يوماً ← درجة عالية). فالحدّان
--    معاً يغطّيان السرقة الكبيرة والسرقة الصغيرة المتكرّرة، بلا صياح يومي
--    يُفقد التنبيهَ معناه.
-- =====================================================================

-- ── الجرعة: كم من هذه المادة يدخل في مشروب واحد ──────────────────────
create or replace function material_dose(p_material uuid) returns integer
language sql stable as $$
  select coalesce(
    -- ١) تجاوز يدوي إن كُتب
    (select m.dose_grams from materials m
      where m.id = p_material and coalesce(m.dose_grams, 0) > 0),

    -- ٢) محصول حبوب: غرامات القهوة الأكثر شيوعاً في المشروبات التي تُقدَّم به
    (select r.coffee_grams
       from product_crops pc
       join recipes r on r.product_id = pc.product_id and r.active
      where pc.material_id = p_material and pc.available and r.coffee_grams > 0
      group by r.coffee_grams
      order by count(*) desc, r.coffee_grams
      limit 1),

    -- ٣) مادة عادية (حليب · كوب · غطاء): الكمية الأكثر شيوعاً في الوصفات
    (select ri.qty
       from recipe_items ri
       join recipes r on r.id = ri.recipe_id and r.active
      where ri.material_id = p_material
      group by ri.qty
      order by count(*) desc, ri.qty
      limit 1),

    -- ٤) مادة إضافات (سيروب · حليب شوفان): لا تدخل وصفةً أساسية، بل تُضاف
    --    باختيار الزبون. جرعتها كمية الإضافة الواحدة.
    (select mo.qty
       from modifier_options mo
      where mo.material_id = p_material and mo.available and mo.qty > 0
      group by mo.qty
      order by count(*) desc, mo.qty
      limit 1),

    -- ٥) مادة بديلة (حليب شوفان بدل الحليب): كميّتها صفر في الخيار لأنها
    --    تأخذ كمية المادة التي تحلّ محلّها — فجرعتها جرعتها.
    (select material_dose(mo.replaces_base_material_id)
       from modifier_options mo
      where mo.material_id = p_material and mo.available
        and mo.replaces_base_material_id is not null
        and mo.replaces_base_material_id <> p_material   -- منع دوران لا نهائي
      limit 1)
  );
$$;

comment on function material_dose(uuid) is
  'كمية المادة في مشروب واحد — من `materials.dose_grams` إن كُتب، وإلا من الوصفة الفعّالة.';

-- ── فروقات الجرد: الجرعة محسوبة، والمستوى لا يعتمد على النسبة وحدها ──
-- الأعمدة القديمة بترتيبها وأنواعها كما هي (تعتمد عليها v_repeated_variance
-- و v_exceptions)، و`dose` مُضاف في الآخر لتعرضه الواجهة.
create or replace view v_stock_variance as
  select c.id as count_id,
         c.branch_id,
         c.created_at,
         business_day(c.created_at, c.branch_id) as business_day,
         c.user_id,
         i.material_id,
         m.name as material_name,
         m.base_unit,
         i.expected,
         i.counted,
         i.variance,
         i.variance_pct,
         b.variance_threshold_pct as threshold_pct,
         case when d.dose > 0
              then round(abs(i.variance)::numeric / d.dose::numeric, 2)
         end as equivalent_doses,
         case
           when i.variance >= 0 then 'ok'
           -- مشروبان كاملان فأكثر: أحمر مهما صغرت النسبة
           when d.dose > 0 and abs(i.variance) >= 2 * d.dose then 'over_threshold'
           when i.variance_pct is not null
                and abs(i.variance_pct) <= b.variance_threshold_pct then 'within_threshold'
           else 'over_threshold'
         end as level,
         case when i.variance < 0 then 'unexplained_variance' else 'surplus' end as label,
         d.dose
  from stock_counts c
  join stock_count_items i on i.count_id = c.id
  join materials m on m.id = i.material_id
  join branches b on b.id = c.branch_id
  cross join lateral (select coalesce(material_dose(i.material_id), 0) as dose) d;

comment on view v_stock_variance is
  'فرق كل مادة في كل جرد. المستوى أحمر إذا تجاوز النسبةَ المسموحة أو عادل مشروبين فأكثر.';

-- ── لوحة الشاذّ: تنبيه الهدر كان معطّلاً بصمت ────────────────────────
-- `high_waste` مكتوب منذ ٠٠١٦ بشرط `coalesce(m.dose_grams,0) > 0` — ولأن
-- العمود فارغ لكل مادة حقيقية، **لم يُطلق هذا التنبيه ولا مرّة**. أي أن
-- الهدر الوهمي الذي يُغطّي به السارق نقصَ المواد كان يمرّ بلا صوت.
-- نعيد بناء اللوحة على `material_dose()` فيعمل الشرط، وعلى اليوم المحاسبي
-- بدل منتصف الليل ليتّسق مع بقيّة النظام، ونُضيف للتفصيل ما يشرح نفسه:
-- الوحدة، والجرعة، وكم مشروباً يعادل الرقم.
create or replace view v_exceptions as
  -- فرق درج
  select s.branch_id, 'cash_variance' as kind, s.closed_at as at,
         s.employee_id as user_id, s.id as entity_id,
         jsonb_build_object('expected', s.expected_cash, 'actual', s.counted_cash,
                            'variance', s.variance) as detail,
         case when abs(coalesce(s.variance,0)) >= 10000 then 'high' else 'medium' end as severity
  from shifts s
  where s.status = 'CLOSED' and coalesce(s.variance,0) <> 0
    and s.closed_at > now() - interval '30 days'

  union all
  -- نقص مخزون غير مُفسَّر
  select v.branch_id, 'inventory_variance', v.created_at, v.user_id, v.count_id,
         jsonb_build_object('material', v.material_name, 'unit', v.base_unit,
                            'variance', v.variance, 'pct', v.variance_pct,
                            'doses', v.equivalent_doses, 'dose', v.dose),
         case when v.level = 'over_threshold' then 'high' else 'medium' end
  from v_stock_variance v
  where v.variance < 0 and v.created_at > now() - interval '30 days'

  union all
  -- نقص متكرّر: نمط لا حادثة
  select r.branch_id, 'repeated_variance', now(), null::uuid, null::uuid,
         jsonb_build_object('material', r.material_name, 'times', r.counts_with_shortage,
                            'total', r.total_shortage, 'doses', r.max_equivalent_doses),
         'high'
  from v_repeated_variance r

  union all
  -- إلغاء بعد الدفع
  select o.branch_id, 'order_voided', vo.created_at, vo.voided_by, o.id,
         jsonb_build_object('order_number', o.order_number, 'total', o.total,
                            'reason', vo.reason, 'cash_returned', vo.cash_returned),
         'high'
  from order_voids vo join orders o on o.id = vo.order_id
  where vo.created_at > now() - interval '30 days'

  union all
  -- إرجاع مبلغ
  select rf.branch_id, 'refund', rf.created_at, rf.requested_by, rf.order_id,
         jsonb_build_object('amount', rf.amount, 'reason', rf.reason,
                            'approved_by', rf.approved_by),
         'high'
  from refunds rf
  where rf.status = 'COMPLETED' and rf.created_at > now() - interval '30 days'

  union all
  -- فتح درج بلا بيع
  select n.branch_id, 'no_sale_open', n.created_at, n.user_id, n.id,
         jsonb_build_object('reason', n.reason), 'medium'
  from no_sale_opens n
  where n.created_at > now() - interval '30 days'

  union all
  -- هدر عالٍ: أكثر من خمسة مشروبات مهدورة في يوم محاسبي واحد
  select t.branch_id, 'high_waste', max(t.created_at), null::uuid, t.material_id,
         jsonb_build_object('material', m.name, 'unit', m.base_unit,
                            'qty', -sum(t.qty_delta), 'dose', max(d.dose),
                            'doses', round(-sum(t.qty_delta)::numeric / max(d.dose), 1),
                            'day', business_day(max(t.created_at), t.branch_id)),
         'medium'
  from inventory_transactions t
  join materials m on m.id = t.material_id
  cross join lateral (select coalesce(material_dose(t.material_id), 0) as dose) d
  where t.type = 'WASTE' and t.created_at > now() - interval '30 days' and d.dose > 0
  group by t.branch_id, t.material_id, m.name, m.base_unit,
           business_day(t.created_at, t.branch_id)
  having -sum(t.qty_delta) > 5 * max(d.dose)

  union all
  -- كثرة خصومات
  select o.branch_id, 'excessive_discounts', max(d.created_at), d.applied_by, null::uuid,
         jsonb_build_object('count', count(*), 'total', sum(d.amount)), 'medium'
  from order_discounts d join orders o on o.id = d.order_id
  where d.created_at > now() - interval '7 days'
  group by o.branch_id, d.applied_by
  having count(*) >= 10

  union all
  -- مشروبات موظفين غير معتادة
  select o.branch_id, 'unusual_staff_drinks', max(o.created_at), o.employee_id, null::uuid,
         jsonb_build_object('count', count(*)), 'medium'
  from orders o
  where o.order_type = 'STAFF_DRINK' and o.created_at > now() - interval '7 days'
  group by o.branch_id, o.employee_id
  having count(*) >= 15

  union all
  -- صرف مكافآت غير معتاد
  select o.branch_id, 'unusual_loyalty_redemptions', max(o.created_at), o.employee_id, null::uuid,
         jsonb_build_object('count', count(*)), 'medium'
  from orders o
  where o.order_type = 'LOYALTY_REWARD' and o.created_at > now() - interval '7 days'
  group by o.branch_id, o.employee_id
  having count(*) >= 20;

comment on view v_exceptions is
  'كل ما يستحقّ نظرة من المالك، بمصدر واحد وتفصيل يشرح نفسه (§56).';
