\pset pager off
\set QUIET on
create or replace function must_fail(p_sql text, p_label text) returns text
language plpgsql as $$
begin
  execute p_sql;
  return '✗ FAIL — نجحت وكان يجب أن تُرفض: ' || p_label;
exception when others then
  return '✓ ' || p_label || '  →  ' || left(sqlerrm, 70);
end $$;

\echo '=== تكامل القاعدة (§12 · §15 · §18 · §51 · §58) ==='
select must_fail($$update inventory_transactions set qty_delta = 0$$, 'تعديل الدفتر مرفوض');
select must_fail($$delete from inventory_transactions$$, 'حذف الدفتر مرفوض');
select must_fail($$update audit_log set action = 'x'$$, 'تعديل سجلّ التدقيق مرفوض');
select must_fail($$delete from audit_log$$, 'حذف سجلّ التدقيق مرفوض');
select must_fail($$update materials set cached_stock = 999999 where name = 'حليب'$$, 'تعديل الرصيد مباشرة مرفوض');
select must_fail($$insert into inventory_transactions (business_id,branch_id,material_id,type,qty_delta,reason,user_id)
                   select business_id, (select id from branches limit 1), id, 'WASTE', -999999, 'اختبار', (select id from users limit 1)
                   from materials where name = 'حليب'$$, 'مخزون سالب مرفوض');
select must_fail($$delete from payments$$, 'حذف دفعة مرفوض');
select must_fail($$update payments set amount = 1$$, 'تعديل مبلغ الدفع مرفوض');
select must_fail($$update payments set status = 'FAILED' where status = 'CONFIRMED'$$, 'CONFIRMED → FAILED مرفوض');
select must_fail($$update orders set status = 'DRAFT' where status = 'COMPLETED'$$, 'COMPLETED → DRAFT مرفوض');
select must_fail($$update orders set status = 'PAID' where status = 'COMPLETED'$$, 'COMPLETED → PAID مرفوض');
select must_fail($$insert into cash_movements (shift_id, type, amount, reason, user_id)
                   values ((select id from shifts limit 1), 'DROP', 5000, 'موجب', (select id from users limit 1))$$,
                 'سحب نقد بإشارة موجبة مرفوض');
select must_fail($$update cash_movements set amount = 0$$, 'تعديل حركة كاش مرفوض');

\echo ''
\echo '=== ما يجب أن ينجح ==='
update orders set status = 'VOIDED' where order_number = 1001;
select '✓ COMPLETED → VOIDED مسموح' as ok;
update orders set status = 'COMPLETED' where false;
