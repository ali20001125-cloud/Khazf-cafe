-- =====================================================================
-- 0035 · أيّ مادة أوقفت المشروب؟
--
-- قال المالك: «أضفت مخزوناً، وما زال يطلع خلصت مادته». وكان النظام محقّاً:
-- أضاف بنّاً ولم يُضِف حليباً ولا أكواباً، والكوب ينقصه مكوّنٌ واحد فلا
-- يُحضَّر. لكن الرسالة **لم تقل أي مادة** — فبدت خطأً وهي حقيقة.
--
-- ورسالةٌ تقول «توقّف» ولا تقول «لماذا» تُرجع صاحبها إلى التخمين، وهو
-- أبطأ من ألّا يُقال له شيء.
-- =====================================================================

create or replace view v_servings_left as
  with need as (
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
  agg as (
    select product_id, crop_id, material_id,
           sum(qty) filter (where not takeaway_only) as qty_dine_in,
           sum(qty) as qty_takeaway
    from need
    group by product_id, crop_id, material_id
  ),
  per_material as (
    select a.product_id, a.crop_id, m.name as material_name,
           case when coalesce(a.qty_dine_in, 0) > 0
                then greatest(m.cached_stock, 0) / a.qty_dine_in end::int  as srv_dine_in,
           case when a.qty_takeaway > 0
                then greatest(m.cached_stock, 0) / a.qty_takeaway end::int as srv_takeaway
    from agg a join materials m on m.id = a.material_id
  )
  select product_id, crop_id as crop_material_id,
         min(srv_dine_in)::int  as servings_dine_in,
         min(srv_takeaway)::int as servings_takeaway,
         -- اسم المادة التي حدّت العدد: هي ما يُشترى لتعود المبيعات
         (array_agg(material_name order by coalesce(srv_dine_in, 2147483647), material_name)
            filter (where srv_dine_in is not null))[1] as blocker_dine_in,
         (array_agg(material_name order by coalesce(srv_takeaway, 2147483647), material_name)
            filter (where srv_takeaway is not null))[1] as blocker_takeaway
  from per_material
  group by product_id, crop_id;

comment on view v_servings_left is
  'كم كوباً يكفي له المخزون لكل (مشروب × محصول)، ومعه اسم المادة التي حدّت العدد — فالرسالة تقول ما يُشترى لا «توقّف» وحدها.';
