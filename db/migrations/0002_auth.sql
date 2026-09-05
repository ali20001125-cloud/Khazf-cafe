-- =====================================================================
-- م١ — دعم الدخول الآمن: حدّ محاولات PIN + قفل مؤقّت
-- المواصفة (CAFE-POS-TECH.md §قواعد التكامل): «PIN مُهشّر + حدّ محاولات
-- (قفل بعد N فشل)». نضيف العدّاد ووقت القفل على users.
-- =====================================================================

begin;

alter table users
  add column if not exists failed_pin_attempts integer not null default 0,
  add column if not exists locked_until timestamptz,
  add column if not exists last_login_at timestamptz;

commit;
