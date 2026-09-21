-- أكواد الخصم.
--
-- **هذه أخطر ميزةٍ بُنيت حتى الآن، لأنها الوحيدة التي تُنقص المال في
-- الدرج بأمرٍ من خارج المحلّ.** ومن هنا كل قيدٍ أدناه.
--
-- الخطر ليس نظرياً: كودٌ يُكتب على ورقةٍ في معرض، فيصوّره واحد ويضعه
-- في مجموعة واتساب، فيأتي مئةٌ بخصم النصف في يومٍ واحد. وصاحب المحلّ
-- يكتشف ذلك مساءً وقد بِيعت القهوة بأقلّ من تكلفتها.
--
-- فلكل كودٍ سقفان: **عددُ مرّاتٍ** و**تاريخُ انتهاء**، وكلاهما مطلوب
-- في الشاشة. والعدّ يقع **في القاعدة داخل معاملةٍ واحدة** لا في
-- الخادم: كودٌ سقفه عشرون يُقرأ ويُكتب في الخادم يُستهلك ثلاثين مرّةً
-- حين يُضغط في اللحظة نفسها من جهازين.

do $$ begin
  create type promo_kind as enum ('percent', 'amount');
exception when duplicate_object then null; end $$;

create table if not exists promo_codes (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id),
  -- الكود يُقارَن بحروفٍ كبيرة دائماً: من يكتبه على هاتفه لا يدقّق
  code          text not null,
  kind          promo_kind not null,
  -- النسبة ١..٥٠ أو المبلغ بالدينار. السقف خمسون بالمئة عمداً:
  -- خصمٌ أكبر من النصف خطأُ كتابةٍ في الغالب لا قرارَ تسويق.
  value         integer not null,
  -- لا يُطبَّق على فاتورةٍ أصغر من هذا — يمنع خصم ٥٠٠٠ على كوبٍ بـ٣٠٠٠
  min_total     integer not null default 0,
  -- أقصى ما يُحسم بالنسبة، فـ«٢٠٪» على فاتورةٍ كبيرة لا تُفاجئ
  max_discount  integer,
  max_uses      integer not null,
  used_count    integer not null default 0,
  starts_at     timestamptz not null default now(),
  expires_at    timestamptz not null,
  active        boolean not null default true,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now(),

  constraint promo_value_sane check (
    (kind = 'percent' and value between 1 and 50) or
    (kind = 'amount'  and value between 1 and 1000000)
  ),
  constraint promo_uses_sane check (max_uses > 0 and used_count >= 0 and used_count <= max_uses),
  constraint promo_window_sane check (expires_at > starts_at),
  constraint promo_min_sane check (min_total >= 0),
  constraint promo_max_discount_sane check (max_discount is null or max_discount > 0)
);

-- كودٌ واحد لكل عمل. والفهرس هو ما يجعل البحث بالكود لحظياً.
create unique index if not exists uq_promo_code
  on promo_codes (business_id, upper(btrim(code)));

/*
 * سجلّ الاستعمال: من استعمل، ومتى، وكم حُسم، وعلى أيّ طلب.
 *
 * **بلا هذا الجدول لا يُعرف أين ذهب المال.** والرقم في `used_count`
 * يقول «عشرون مرّة» ولا يقول أيّ عشرين — فلا تُراجَع حادثةٌ ولا
 * يُكتشف موظّفٌ يخصم لنفسه.
 */
create table if not exists promo_uses (
  id          uuid primary key default gen_random_uuid(),
  promo_id    uuid not null references promo_codes(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  user_id     uuid references users(id),
  discount    integer not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_promo_uses_promo on promo_uses (promo_id, created_at desc);

/**
 * التحقّق من كودٍ دون استهلاكه — للعرض على الشاشة قبل الدفع.
 *
 * يُرجع سبب الرفض بنصّه: «انتهى» و«اكتمل العدد» و«الفاتورة أقلّ من…»
 * ثلاثةُ أشياء مختلفة، والباريستا الذي يقرأ «غير صالح» يعيد المحاولة
 * ثلاث مرّات أمام الزبون.
 */
create or replace function public.promo_check(
  p_business uuid, p_code text, p_total integer
) returns jsonb
language plpgsql
stable
as $function$
declare
  r promo_codes%rowtype;
  v_disc integer;
begin
  select * into r from promo_codes
   where business_id = p_business
     and upper(btrim(code)) = upper(btrim(p_code));

  if not found then return jsonb_build_object('ok', false, 'why', 'كود غير معروف'); end if;
  if not r.active then return jsonb_build_object('ok', false, 'why', 'الكود موقوف'); end if;
  if now() < r.starts_at then return jsonb_build_object('ok', false, 'why', 'الكود لم يبدأ بعد'); end if;
  if now() >= r.expires_at then return jsonb_build_object('ok', false, 'why', 'انتهت صلاحية الكود'); end if;
  if r.used_count >= r.max_uses then return jsonb_build_object('ok', false, 'why', 'اكتمل عدد مرّات الكود'); end if;
  if p_total < r.min_total then
    return jsonb_build_object('ok', false, 'why', 'الفاتورة أقلّ من الحدّ الأدنى للكود');
  end if;

  v_disc := case when r.kind = 'percent'
                 then (p_total * r.value) / 100
                 else r.value end;
  if r.max_discount is not null then v_disc := least(v_disc, r.max_discount); end if;
  -- **لا يتجاوز الخصم الفاتورة أبداً**: فاتورةٌ سالبة تعني درجاً يدفع
  v_disc := least(v_disc, p_total);

  return jsonb_build_object('ok', true, 'promo_id', r.id, 'discount', v_disc, 'code', r.code);
end;
$function$;

/**
 * استهلاك الكود — **العدّ والحجز في عبارةٍ واحدة.**
 *
 * `update ... where used_count < max_uses` ذرّيّةٌ في القاعدة: جهازان
 * يضغطان في اللحظة نفسها على آخر استعمالٍ متاح، فينجح واحد ويُردّ
 * الآخر. ولو قُرئ العدد ثمّ كُتب من الخادم لمرّ الاثنان.
 */
create or replace function public.promo_redeem(
  p_business uuid, p_code text, p_total integer,
  p_order uuid, p_user uuid
) returns jsonb
language plpgsql
as $function$
declare
  v_check jsonb;
  v_id uuid;
  v_disc integer;
  v_rows integer;
begin
  v_check := promo_check(p_business, p_code, p_total);
  if not (v_check->>'ok')::boolean then return v_check; end if;

  v_id := (v_check->>'promo_id')::uuid;
  v_disc := (v_check->>'discount')::int;

  update promo_codes
     set used_count = used_count + 1
   where id = v_id
     and business_id = p_business
     and active
     and now() >= starts_at and now() < expires_at
     and used_count < max_uses;

  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    -- سبق غيرُه إلى آخر استعمال بين الفحص والحجز
    return jsonb_build_object('ok', false, 'why', 'اكتمل عدد مرّات الكود');
  end if;

  insert into promo_uses (promo_id, order_id, user_id, discount)
  values (v_id, p_order, p_user, v_disc);

  return jsonb_build_object('ok', true, 'promo_id', v_id, 'discount', v_disc);
end;
$function$;
