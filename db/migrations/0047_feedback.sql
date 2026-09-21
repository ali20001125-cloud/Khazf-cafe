-- رأي الزبون — يصل المالك ولا يُنشر.
--
-- «Item Ratings & Reviews» في الخدمات المدفوعة تعرض النجوم على المنيو
-- نفسه. وهذا خطأٌ لمحلٍّ لم يفتح بعد: صفحةٌ بلا تقييمات تبدو مهجورة،
-- وأوّل زبونٍ غاضبٍ في يومٍ سيّئ يكتب نجمةً تبقى فوق المشروب شهوراً.
-- والمالك لا يملك حذفها — فإن ملكه صارت التقييمات دعايةً لا رأياً.
--
-- فالرأي هنا **بريدٌ خاصّ**: يقرأه المالك، ويتصرّف. وهي الفائدة كلّها
-- بلا الخطر.

create table if not exists feedback (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id),
  -- ١..٥، أو لا شيء: من أراد أن يكتب بلا أن يُنجّم فله ذلك
  rating       smallint,
  note         text,
  -- المشروب الذي يخصّه الرأي، إن اختاره. و`on delete set null`: حذف
  -- منتجٍ قديم لا يجوز أن يمحو ما قيل فيه.
  product_id   uuid references products(id) on delete set null,
  -- هاتفٌ اختياريّ لمن أراد ردّاً. وليس مطلوباً: اشتراطه يُسكت أكثر
  -- ممّا يُنطق، ومن كتب شكوى وهو يعرف أنه معروف يُلطّفها.
  phone        text,
  -- المالك يعلّم ما قرأه، فلا يقرأ الشيء مرّتين ولا يفوته شيء
  read_at      timestamptz,
  created_at   timestamptz not null default now(),

  constraint feedback_rating_range check (rating is null or (rating between 1 and 5)),
  -- رأيٌ بلا نجمة وبلا كلمة ليس رأياً
  constraint feedback_not_empty check (rating is not null or (note is not null and length(btrim(note)) > 0))
);

-- الاستعلام الوحيد: «ما لم أقرأه بعد، الأحدث أوّلاً»
create index if not exists idx_feedback_business_new
  on feedback (business_id, created_at desc);

comment on table feedback is
  'رأي الزبون من المنيو. خاصٌّ للمالك — لا يُعرض على صفحةٍ عامّة.';
