-- =====================================================================
-- 0031 · تصفير بيانات التجربة قبل التشغيل الحقيقي
--
-- قبل أن يفتح المقهى، وبعد كل أيام تجربة، تبقى في القاعدة طلباتٌ وفواتير
-- لم تحدث. وتركها ليس حياداً: تدخل في الأرباح وفي متوسّط البيع وفي معدّل
-- الاستهلاك، فيقرأ المالك أرقاماً مخلوطةً بلعب.
--
-- ولهذا **زرّ** لا أمرٌ يُشغَّل من خارج النظام: ما يُحتاج مرّتين يُبنى مرّة،
-- وما يُشغَّل بيد أحدٍ خارج التطبيق لا يُسجَّل ولا يُحاسَب عليه.
--
-- ثلاثة حرّاس على هذه الدالّة: كلمة تأكيد تُكتب بالحرف، وصاحب العمل وحده،
-- وقاعدةٌ فيها عملٌ واحد — لأن `truncate` لا يعرف `business_id`.
-- =====================================================================

create or replace function reset_transactions(
  p_business_id uuid, p_user_id uuid, p_confirm text
) returns jsonb
language plpgsql as $fn$
declare
  v_before jsonb;
  v_role   text;
begin
  -- ١) كلمة التأكيد: تُكتب بالحرف، فلا يقع الحذف بنقرةٍ سهوٍ ولا باستدعاءٍ عابر
  if coalesce(p_confirm, '') <> 'تصفير' then
    raise exception 'التصفير يحتاج كتابة كلمة «تصفير» للتأكيد';
  end if;

  -- ٢) المالك وحده
  select role::text into v_role from users
   where id = p_user_id and business_id = p_business_id and active;
  if v_role is distinct from 'owner' then
    raise exception 'التصفير للمالك وحده';
  end if;

  -- ٣) `truncate` يمسح الجدول كلّه ولا يعرف عملاً من عمل. فما دامت الدالّة
  --    تستعمله، تُرفض على قاعدةٍ فيها أكثر من عمل بدل أن تمحو عمل غيره.
  if (select count(*) from businesses) > 1 then
    raise exception 'القاعدة فيها أكثر من عمل — التصفير الشامل غير آمن هنا';
  end if;

  v_before := jsonb_build_object(
    'orders',    (select count(*) from orders),
    'payments',  (select count(*) from payments),
    'revenue',   (select coalesce(sum(amount), 0) from payments),
    'inventory', (select count(*) from inventory_transactions),
    'shifts',    (select count(*) from shifts),
    'audit',     (select count(*) from audit_log));

  -- الدفاتر للإلحاق فقط، و`delete` عليها مرفوض بحقّ. و`truncate` لا يُشغّل
  -- مُشغّلات الصفوف، فهو المخرج الوحيد الذي لا يكسر الحارس ولا يلتفّ عليه.
  truncate
    order_item_modifiers, order_discounts, order_items, order_voids,
    refund_items, refunds, payments, orders,
    stock_count_items, stock_counts, inventory_transactions,
    cash_movements, no_sale_opens, drawer_handovers, day_closes, shifts,
    loyalty_ledger, loyalty_rewards, loyalty_accounts, otp_codes, customers,
    price_history, audit_log
  restart identity cascade;

  -- `truncate` لا يُشغّل مُشغّل الدفتر، فيبقى `cached_stock` معلّقاً على رقمٍ
  -- بلا دفترٍ تحته. وتصفيره يرفضه حارس المواد — وهو محقّ: الرصيد يُشتقّ من
  -- الدفتر ولا يُكتب بيد. فنوقف الحارس لحظةً هنا وحدها ثم نعيده.
  alter table materials disable trigger materials_guard;
  update materials set cached_stock = 0;
  alter table materials enable trigger materials_guard;

  -- أوّل فاتورة حقيقية تأخذ ١٠٠١ — لا رقماً يكمّل تجربة
  update order_counters set next_number = 1001;

  -- أوّل صفّ في السجلّ الجديد يشرح لماذا هو أوّله
  insert into audit_log (business_id, user_id, action, entity_type, before, reason)
  values (p_business_id, p_user_id, 'reset_transactions', 'business', v_before,
          'تصفير بيانات التجربة قبل التشغيل');

  return jsonb_build_object('ok', true, 'deleted', v_before);
end;
$fn$;

comment on function reset_transactions(uuid, uuid, text) is
  'حذف بيانات التجربة (طلبات · مخزون · ورديات · درج · تدقيق) مع إبقاء الكتالوج والمستخدمين والإعدادات. للمالك، بكلمة تأكيد، وعلى قاعدةٍ فيها عملٌ واحد.';
