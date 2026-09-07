-- =====================================================================
-- 0021 — الإلغاء بعد الدفع: أين ذهب المال؟
--
-- الخلل: إلغاء فاتورة مدفوعة كان لا يمسّ دفتر الكاش إطلاقاً، فينتج
-- خطأ في الاتجاهين:
--   • إلغاء شرعي (أُعيد المال للزبون): الدرج ينقص فعلياً بينما المتوقّع
--     لا ينقص ← يظهر نقص كأنه سرقة، والباريستا الأمين يُتّهم.
--   • إلغاء احتيالي (الباريستا يُلغي ويحتفظ بالمال): الدرج ينقص أيضاً
--     ← يُكشف. صحيح بالصدفة لا بالتصميم.
--
-- الجذر: النظام لا يعرف **هل خرج المال من الدرج أم لا**. وهذا ليس شيئاً
-- يُستنتج — يجب أن يُسأل عنه صراحةً وقت الإلغاء ويُسجَّل.
--
-- الحلّ: `order_voids.cash_returned` — سؤال إلزامي جوابه يُحدّد إن كانت
-- تُكتب حركة كاش عكسية. وبعدها:
--   • أُعيد المال  → حركة سالبة → الدرج والمتوقّع ينقصان معاً → فرق صفر ✅
--   • لم يُعد المال → لا حركة → المال يجب أن يبقى في الدرج. إن اختفى
--     ظهر نقص حقيقي، ولا عذر له. ✅
-- =====================================================================

alter table order_voids add column if not exists cash_returned boolean not null default false;

comment on column order_voids.cash_returned is
  'هل أُعيد المال للزبون عند الإلغاء؟ نعم ← تُكتب حركة كاش عكسية. لا ← المال يجب أن يبقى في الدرج، وغيابه نقص حقيقي.';

create or replace function khazaf_void_cash_reversal() returns trigger
language plpgsql as $fn$
declare
  v_cash   integer;
  v_shift  uuid;
  v_branch uuid;
begin
  if not new.cash_returned then return null; end if;

  select coalesce(sum(p.amount), 0), o.shift_id, o.branch_id
    into v_cash, v_shift, v_branch
  from orders o
  left join payments p on p.order_id = o.id and p.status = 'CONFIRMED' and p.method = 'cash'
  where o.id = new.order_id
  group by o.shift_id, o.branch_id;

  if coalesce(v_cash, 0) <= 0 or v_shift is null then return null; end if;

  insert into cash_movements (shift_id, branch_id, type, amount, reason, user_id)
  values (v_shift, v_branch, 'REFUND', -v_cash,
          'إلغاء فاتورة — أُعيد المال للزبون', new.voided_by);
  return null;
end;
$fn$;

drop trigger if exists order_voids_cash_reversal on order_voids;
create trigger order_voids_cash_reversal
  after insert on order_voids
  for each row execute function khazaf_void_cash_reversal();
