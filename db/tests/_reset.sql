-- تصفير بين الاختبارات: كل سكربت يفترض مقهى بلا وردية مفتوحة ولا حركة.
-- المنتجات والمواد والمستخدمون (من seed.sql) تبقى كما هي.
truncate loyalty_ledger, loyalty_rewards, loyalty_accounts, otp_codes,
         order_item_modifiers, order_discounts, refund_items, refunds, order_voids,
         payments, order_items, inventory_transactions, cash_movements, orders,
         shifts, customers, audit_log, stock_count_items, stock_counts,
         no_sale_opens, drawer_handovers, day_closes
restart identity cascade;
update order_counters set next_number = 1001;

-- `truncate` لا يُشغّل مُشغّلات الصفوف، فيبقى `cached_stock` معلّقاً بلا دفتر.
-- تصفيره يدوياً يرفضه الحارس (وهذا صحيح — الرصيد يُشتقّ من الدفتر)، فنوقف
-- المُشغّلات هنا وحدها. هذا تصفير أدوات اختبار، لا مسار يمرّ به التطبيق.
set session_replication_role = replica;
update materials set cached_stock = 0;
set session_replication_role = origin;
