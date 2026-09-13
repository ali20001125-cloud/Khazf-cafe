-- =====================================================================
-- 0026 · من يعدّ الدرج؟
--
-- كان العدّ واجباً على الباريستا. والمالك سأل: لماذا نحمّله ذلك؟
--
-- والعدّ لا يُعرّف الباريستا شيئاً — يكتب ما بيده ولا يرى المتوقّع ولا
-- الإيراد. لكن السؤال الأصحّ ليس «يعدّ أو لا» بل **من يعدّ**: العدّ هو
-- لحظة انتقال المسؤولية عن الدرج. فإن لم يعدّ أحدٌ عند الإغلاق، ثم ظهر
-- نقصٌ صباحاً، لم يُعرف متى وقع — في الوردية أم بعدها أم ليلاً — ولا
-- يُتّهم أحد ولا يُبرّأ أحد.
--
-- فصار خياراً للمالك:
--   owner   — الباريستا ينهي ورديته ويطلع، والمالك يعدّ ويُدخل الرقم لاحقاً.
--             الوردية تُغلق بانتظار العدّ، ويبقى بندٌ في لوحة المالك حتى يعدّ.
--   barista — العدّ الأعمى كما كان: يعدّ ولا يرى المتوقّع.
--   none    — لا عدّ إطلاقاً. لا فحص للدرج، والنقص لا يُكتشف.
--
-- `counted_cash` و`variance` تبقيان فارغتين حتى يقع العدّ فعلاً — فارغٌ
-- يعني «لم يُعدّ»، وصفرٌ يعني «عُدّ فطابق». الخلط بينهما يصنع طمأنينة
-- كاذبة.
-- =====================================================================

do $$ begin
  create type drawer_count_by as enum ('barista', 'owner', 'none');
exception when duplicate_object then null; end $$;

alter table branches add column if not exists drawer_count_by drawer_count_by
  not null default 'owner';

comment on column branches.drawer_count_by is
  'من يعدّ الدرج عند إغلاق الوردية: الباريستا (أعمى) · المالك لاحقاً · لا أحد.';

-- السياسة تُحفظ **مع الوردية** لا تُقرأ من الفرع لاحقاً: وردية أُغلقت تحت
-- «لا أحد يعدّ» لا تصير «بانتظار عدّك» لأن المالك غيّر الإعداد بعد أسبوع.
-- حكمُ الفعل سياسةُ وقته.
alter table shifts add column if not exists count_mode drawer_count_by;

comment on column shifts.count_mode is
  'سياسة عدّ الدرج التي أُغلقت عليها هذه الوردية. فارغ = وردية قديمة سابقة للهجرة.';

-- ── إغلاق بلا عدّ ────────────────────────────────────────────────────
create or replace function close_shift_uncounted(p_shift_id uuid, p_user_id uuid)
returns jsonb
language plpgsql as $fn$
declare
  v_branch   uuid;
  v_business uuid;
  v_mode     drawer_count_by;
begin
  select s.branch_id, s.business_id, b.drawer_count_by
    into v_branch, v_business, v_mode
  from shifts s join branches b on b.id = s.branch_id
  where s.id = p_shift_id and s.status = 'OPEN' for update of s;
  if not found then raise exception 'الوردية غير مفتوحة'; end if;

  if v_mode = 'barista' then
    raise exception 'هذا الفرع يطلب عدّ الدرج من الباريستا — أدخل المعدود';
  end if;

  -- المتوقّع يُحفظ الآن: هو حقيقة الوردية لحظة إغلاقها، ولو حُسب لاحقاً
  -- لتغيّر بحركاتٍ تالية. أمّا المعدود والفرق فيبقيان فارغين حتى يُعدّ.
  update shifts
     set expected_cash = shift_expected_cash(p_shift_id),
         count_mode = v_mode,
         closed_at = now(), status = 'CLOSED'
   where id = p_shift_id;

  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, after, reason)
  values (v_business, v_branch, p_user_id, 'close_shift', 'shift', p_shift_id,
          jsonb_build_object('counted', null, 'mode', v_mode::text),
          case v_mode when 'owner' then 'إغلاق بانتظار عدّ المالك'
                      else 'إغلاق بلا عدّ (الفرع لا يطلب عدّاً)' end);

  return jsonb_build_object('closed', true, 'awaiting_count', v_mode = 'owner');
end;
$fn$;

comment on function close_shift_uncounted(uuid, uuid) is
  'إغلاق وردية بلا عدّ. المعدود والفرق يبقيان فارغين — فارغٌ يعني «لم يُعدّ» لا «طابق».';

-- ── عدّ المالك بعد الإغلاق ───────────────────────────────────────────
create or replace function count_closed_shift(p_shift_id uuid, p_user_id uuid, p_counted integer)
returns jsonb
language plpgsql as $fn$
declare
  v_branch   uuid;
  v_business uuid;
  v_expected integer;
  v_variance integer;
begin
  if p_counted is null or p_counted < 0 then raise exception 'عدّ غير صالح'; end if;

  select branch_id, business_id, expected_cash
    into v_branch, v_business, v_expected
  from shifts
  where id = p_shift_id and status = 'CLOSED' and counted_cash is null
  for update;
  if not found then raise exception 'لا توجد وردية مُغلقة بانتظار العدّ بهذا المعرّف'; end if;

  -- المتوقّع المحفوظ وقت الإغلاق هو المرجع، لا إعادة حسابٍ الآن
  v_expected := coalesce(v_expected, shift_expected_cash(p_shift_id));
  v_variance := p_counted - v_expected;

  update shifts
     set counted_cash = p_counted, expected_cash = v_expected, variance = v_variance
   where id = p_shift_id;

  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, after, reason)
  values (v_business, v_branch, p_user_id, 'shift_counted', 'shift', p_shift_id,
          jsonb_build_object('counted', p_counted, 'expected', v_expected, 'variance', v_variance),
          'عدّ المالك بعد الإغلاق');

  return jsonb_build_object('counted', p_counted, 'expected', v_expected, 'variance', v_variance);
end;
$fn$;

comment on function count_closed_shift(uuid, uuid, integer) is
  'يُدخل المالك عدّ درجٍ لوردية أُغلقت بانتظاره. المتوقّع من لحظة الإغلاق لا من الآن.';

-- ── ورديات تنتظر العدّ ───────────────────────────────────────────────
create or replace view v_shifts_awaiting_count as
  select s.id, s.branch_id, s.business_id, s.employee_id, u.name as employee_name,
         s.opened_at, s.closed_at, s.opening_float,
         business_day(s.closed_at, s.branch_id) as business_day
  from shifts s
  join users u on u.id = s.employee_id
  join branches b on b.id = s.branch_id
  where s.status = 'CLOSED' and s.counted_cash is null
    -- سياسةُ وقت الإغلاق لا سياسةُ اليوم (والفارغ للورديات السابقة للهجرة
    -- يُقرأ من الفرع، إذ لا سياسة محفوظة لها)
    and coalesce(s.count_mode, b.drawer_count_by) = 'owner'
    and s.closed_at > now() - interval '30 days';

comment on view v_shifts_awaiting_count is
  'ورديات أُغلقت والمالك لم يعدّ درجها بعد. كلّما طال الانتظار ضعف معنى العدّ.';

-- ── الإغلاق الأعمى يحفظ السياسة أيضاً ────────────────────────────────
-- وإلا بقي `count_mode` فارغاً في نصف الورديات، فقُرئ من الفرع — وهو ما
-- تتجنّبه هذه الهجرة أصلاً.
create or replace function close_shift_blind(p_shift_id uuid, p_user_id uuid, p_counted integer)
returns jsonb
language plpgsql as $fn$
declare
  v_expected integer;
  v_variance integer;
  v_branch   uuid;
  v_business uuid;
  v_mode     drawer_count_by;
begin
  if p_counted is null or p_counted < 0 then raise exception 'عدّ غير صالح'; end if;

  select s.branch_id, s.business_id, b.drawer_count_by
    into v_branch, v_business, v_mode
  from shifts s join branches b on b.id = s.branch_id
  where s.id = p_shift_id and s.status = 'OPEN' for update of s;
  if not found then raise exception 'الوردية غير مفتوحة'; end if;

  v_expected := shift_expected_cash(p_shift_id);
  v_variance := p_counted - v_expected;

  update shifts
     set counted_cash = p_counted, expected_cash = v_expected, variance = v_variance,
         count_mode = v_mode, closed_at = now(), status = 'CLOSED'
   where id = p_shift_id;

  insert into audit_log (business_id, branch_id, user_id, action, entity_type, entity_id, after, reason)
  values (v_business, v_branch, p_user_id, 'close_shift', 'shift', p_shift_id,
          jsonb_build_object('counted', p_counted, 'expected', v_expected, 'variance', v_variance),
          'إغلاق أعمى');

  -- بلا أرقام: العرض للباريستا محايد. المالك يقرأ الفرق من shifts/التقارير.
  return jsonb_build_object('closed', true);
end;
$fn$;
