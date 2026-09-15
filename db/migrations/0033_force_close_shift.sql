-- =====================================================================
-- 0033 · إغلاق وردية عالقة
--
-- القاعدة تمنع ورديتين مفتوحتين في الفرع (وهذا صحيح: درجٌ واحد ومسؤولٌ
-- واحد). وثمن ذلك أن وردية بقيت مفتوحة — مات الجهاز، أو خرج الباريستا
-- ولم يُنهِها — **تمنع فتح وردية غداً**. فالمقهى يقف.
--
-- ولم يكن للمالك سبيلٌ لإغلاقها: `close_shift_uncounted` يرفض حين يطلب
-- الفرع عدّ الباريستا — وهو محقّ في الحالة العادية، لكن العالقة ليست
-- عادية: الباريستا غير موجود أصلاً ليعدّ.
--
-- فهذه الدالّة تُغلقها **بسببٍ مكتوب**، وتضعها في «بانتظار عدّك» لا في
-- «لا عدّ»: الدرج ما زال يحتاج من يعدّه، والإغلاق القسري لا يُلغي ذلك.
-- =====================================================================

create or replace function force_close_shift(
  p_shift_id uuid, p_user_id uuid, p_reason text
) returns jsonb
language plpgsql as $fn$
declare
  v_branch   uuid;
  v_business uuid;
  v_opened   timestamptz;
  v_role     text;
begin
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'الإغلاق القسري يحتاج سبباً';
  end if;

  select s.branch_id, s.business_id, s.opened_at
    into v_branch, v_business, v_opened
  from shifts s where s.id = p_shift_id and s.status = 'OPEN' for update of s;
  if not found then raise exception 'الوردية غير مفتوحة'; end if;

  -- المالك وحده: هذا مسارٌ استثنائي، ومن يسلكه يتحمّل أثره
  select role::text into v_role from users
   where id = p_user_id and business_id = v_business and active;
  if v_role is distinct from 'owner' then
    raise exception 'إغلاق الوردية العالقة للمالك وحده';
  end if;

  update shifts
     set expected_cash = shift_expected_cash(p_shift_id),
         count_mode = 'owner',
         closed_at = now(), status = 'CLOSED'
   where id = p_shift_id;

  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id,
                         after, reason)
  values (v_business, v_branch, p_user_id, 'force_close_shift', 'shift', p_shift_id,
          jsonb_build_object('opened_at', v_opened, 'counted', null),
          'إغلاق قسري — ' || btrim(p_reason));

  return jsonb_build_object('closed', true, 'awaiting_count', true);
end;
$fn$;

comment on function force_close_shift(uuid, uuid, text) is
  'إغلاق وردية عالقة بيد المالك بسببٍ مكتوب. تُصبح «بانتظار عدّك» — الدرج ما زال يحتاج عدّاً.';
