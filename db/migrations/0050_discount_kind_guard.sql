-- خصمٌ بنوعٍ مجهول يجب أن **يُفشِل البيع** لا أن يصير صفراً.
--
-- كان `case ... else 0 end`: كل نوعٍ لا يطابق `PERCENT` أو `AMOUNT` أو
-- `COMP` يُنتج خصماً صفراً بصمت. والبيع يتمّ، والفاتورة تُطبع بالسعر
-- الكامل، ولا شيء يُقال لأحد.
--
-- **وقع هذا فعلاً**: مرّرتُ `"kind":"amount"` بحروفٍ صغيرة — والقيم في
-- `discount_kind` كبيرة — فاستُهلك كود الخصم من سقفه، ودفع الزبون
-- كامل الثمن، وقال النظام «تمّ». ولو لم يُفحص الرقم في القاعدة لمرّ
-- هذا إلى المحلّ.
--
-- فالحارس هنا لا في المُستدعي وحده: أخطاءُ الكتابة تُكتشف عند أوّل
-- بيعٍ صاخبةً، لا بعد شهرٍ في فرقٍ لا يُفسَّر.

create or replace function public.khazaf_discount_amount(
  p_kind text, p_value integer, p_subtotal integer
) returns integer
language plpgsql
immutable
as $function$
begin
  return case upper(btrim(p_kind))
    when 'PERCENT' then round(p_subtotal::numeric * least(greatest(p_value,0),100) / 100)::integer
    when 'AMOUNT'  then least(greatest(p_value,0), p_subtotal)
    when 'COMP'    then p_subtotal
    else null end;
exception when others then
  return null;
end;
$function$;

comment on function public.khazaf_discount_amount is
  'مبلغ الخصم، أو NULL لنوعٍ مجهول — والمُستدعي يُفشِل البيع عندها.';
