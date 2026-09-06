-- =====================================================================
-- 0010 — توسيع الأنواع (enums) لتغطية المواصفة الكاملة
--
-- ⚠️ يُطبَّق **جملة‑جملة، خارج معاملة واحدة**: Postgres يسمح بإضافة قيمة
-- لنوع enum داخل معاملة، لكنه يمنع *استخدامها* في نفس المعاملة. لذلك هذا
-- الملفّ منفصل عن بقية الهجرات ولا يستعمل القيم الجديدة.
--
-- المرجع: المواصفة §12 (أنواع حركة المخزون) · §15 (دورة حياة الطلب) ·
-- §16/§42 (طرق الدفع) · §29 (أسباب الهدر).
-- =====================================================================

-- ── أنواع حركة المخزون (§12) ─────────────────────────────────────────
-- الموجود: PURCHASE · SALE · WASTE · STAFF · ADJUSTMENT · COUNT
-- الناقص من المواصفة: LOYALTY_REWARD · TRANSFER_IN · TRANSFER_OUT · OTHER_APPROVED
-- مرادفات مثبتة (لا تُعاد تسميتها حتى لا ينكسر كود التطبيق القائم):
--   STAFF      ≡ STAFF_DRINK       (المواصفة §30)
--   ADJUSTMENT ≡ COUNT_ADJUSTMENT  (المواصفة §36)
alter type inv_txn_type add value if not exists 'LOYALTY_REWARD';
alter type inv_txn_type add value if not exists 'TRANSFER_IN';
alter type inv_txn_type add value if not exists 'TRANSFER_OUT';
alter type inv_txn_type add value if not exists 'OTHER_APPROVED';

-- ── حالات الطلب (§15) ────────────────────────────────────────────────
-- الموجود: DRAFT · PAID · COMPLETED · VOIDED · REFUNDED
alter type order_status add value if not exists 'PENDING_PAYMENT' after 'DRAFT';
alter type order_status add value if not exists 'CANCELLED';
alter type order_status add value if not exists 'PARTIALLY_REFUNDED';

-- ── طرق الدفع (§16 · §42) ────────────────────────────────────────────
-- الموجود: cash · card. المكافأة تُدفع بطريقة loyalty بمبلغ 0.
alter type payment_method add value if not exists 'loyalty';

-- ── حركات الكاش: لا تغيير ────────────────────────────────────────────
-- OPENING · SALE · REFUND · EXPENSE · DROP · REMOVAL تكفي المواصفة §24/§25.
-- فتح الدرج بلا بيع ليس حركة نقدية (لا مبلغ) — جدول مستقلّ في 0012.
