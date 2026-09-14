-- =====================================================================
-- 0027 · كم كوباً بقي؟ — الكاشير يعرف المخزون قبل الطلب
--
-- الخلل: شبكة المشروبات تقرأ `product_crops.available` وحدها، وهي رايةٌ
-- يرفعها المالك يدوياً. أمّا الرصيد الحقيقي فلا تعرفه. فإذا خلص الحليب بقي
-- اللاتيه مضغوطاً شغّالاً: يأخذ الباريستا الطلب، ويحضّره، ثم **يفشل الدفع**
-- عند خصم المخزون.
--
-- والفشل المتأخّر أسوأ من المنع المبكر: الزبون انتظر، والمشروب حُضِّر،
-- والمواد استُهلكت بلا فاتورة. الكاشير يجب أن يعرف قبل الضغطة لا بعدها.
--
-- فهذا العرض يحسب لكل (مشروب × محصول): كم كوباً يكفي له المخزون. والحساب
-- للحالتين معاً — جلوساً وسفرياً — لأن الكوب والغطاء يدخلان السفري وحده،
-- فقد ينفد الكوب ويبقى الجلوس ممكناً. رقمٌ واحد لهما يمنع بيعاً ممكناً.
-- =====================================================================

create or replace view v_servings_left as
  with need as (
    -- حاجة الكوب الواحد من كل مادة، لكل (مشروب × محصول)
    select pc.product_id, pc.material_id as crop_id,
           pc.material_id as material_id,
           r.coffee_grams as qty,
           false as takeaway_only
    from product_crops pc
    join recipes r on r.product_id = pc.product_id and r.active
    where r.coffee_grams > 0

    union all

    select pc.product_id, pc.material_id as crop_id,
           ri.material_id, ri.qty, ri.only_takeaway
    from product_crops pc
    join recipes r on r.product_id = pc.product_id and r.active
    join recipe_items ri on ri.recipe_id = r.id
  ),
  -- مادةٌ قد تتكرّر (محصولٌ يدخل أيضاً بنداً في الوصفة) فتُجمع حاجتها
  agg as (
    select product_id, crop_id, material_id,
           sum(qty) filter (where not takeaway_only) as qty_dine_in,
           sum(qty) as qty_takeaway
    from need
    group by product_id, crop_id, material_id
  )
  select a.product_id, a.crop_id as crop_material_id,
         -- أقلّ مادة هي الحدّ: كوبٌ ينقصه مكوّن واحد لا يُحضَّر
         min(case when coalesce(a.qty_dine_in, 0) > 0
                  then greatest(m.cached_stock, 0) / a.qty_dine_in end)::int  as servings_dine_in,
         min(case when a.qty_takeaway > 0
                  then greatest(m.cached_stock, 0) / a.qty_takeaway end)::int as servings_takeaway
  from agg a
  join materials m on m.id = a.material_id
  group by a.product_id, a.crop_id;

comment on view v_servings_left is
  'كم كوباً يكفي له المخزون لكل (مشروب × محصول)، جلوساً وسفرياً. الحدّ أقلُّ مادة.';
