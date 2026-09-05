# خزف كافيه — المواصفة التقنية (٣ أجزاء)
> الأساس الذي يبني منه Claude Code مباشرة، بلا اجتهاد. يُقرأ بعد `CAFE-POS-SPEC.md`.
> **الجزء ١:** Database Schema · **الجزء ٢:** Permission Matrix · **الجزء ٣:** State & Transaction Rules.
>
> **اتفاقيات عامة (تطبَّق في كل مكان):**
> - **الفلوس = عدد صحيح (دينار عراقي كامل)** — لا floats، لا كسور.
> - **كميات المخزون = عدد صحيح بالوحدة الأساس** (g / ml / pcs). الإدخال بالكيلو/اللتر يُحوَّل (kg→g، L→ml).
> - **المعرّفات:** `id` = uuid (داخلي) · `order_number` = عدد مقروء متسلسل لكل فرع يبدأ 1001.
> - **الوقت:** يُخزَّن `timestamptz` بـUTC من السيرفر · يُعرض بتوقيت **بغداد (UTC+3، بلا توقيت صيفي)**.
> - كل جدول تشغيلي فيه `business_id` و`branch_id` (خطاطيف التوسّع).
> - **لا حذف:** المنتجات/المستخدمون يُعطَّلون (`active=false`)؛ العمليات المالية/المخزنية **لا تُعدَّل ولا تُحذف** — التصحيح بعملية عكسية.
> - فهرس على كل مفتاح خارجي و`(branch_id, created_at)`.

---

# الجزء ١ — Database Schema (V1)

### businesses
`id` · `name` · `created_at`

### branches
`id` · `business_id→businesses` · `name` · `timezone`(default 'Asia/Baghdad') · `standard_float`(int) · `pos_locked`(bool, default false — القفل الطارئ) · `active` · `created_at`

### users
`id` · `business_id` · `name` · `role`(enum: `owner`|`barista`) · `pin_hash`(نصّ مُهشّر bcrypt — **لا PIN صريح**) · `active` · `created_at`
- `user_branch_access(user_id, branch_id)` — خطّاف: أي فرع يخدم فيه (الآن كلهم فرع واحد).

### materials — المواد (حبوب كل محصول · حليب · أكواب · أغطية)
`id` · `business_id` · `name` · `base_unit`(enum: `g`|`ml`|`pcs`) · `low_threshold`(int) · `current_cost`(int, دينار لكل وحدة أساس — متوسط مرجّح) · `cached_stock`(int — **رصيد مشتَق، لا يُعدَّل مباشرة**) · `active`
- فهرس: `(business_id, active)`.

### products — المشروبات
`id` · `business_id` · `name` · `category` · `active` · `paused`(bool — إيقاف مؤقت) · `daily_limit`(int nullable — كمية يومية) · `is_daily_special`(bool) · `sort`(int — ترتيب شاشة البيع)

### product_crops — محاصيل المشروب + سعر كل محصول
`id` · `product_id→products` · `material_id→materials`(الحبوب) · `price`(int) · `available`(bool)
- قيد: `unique(product_id, material_id)`.
- إن كان للمشروب صفّ واحد → المحصول تلقائي؛ أكثر → يُجبر الاختيار.

### recipes — الوصفة (نسخة لكل مشروب)
`id` · `product_id` · `version`(int) · `coffee_grams`(int — حبوب المحصول المختار) · `active`(bool)
### recipe_items — مواد الوصفة الثابتة (غير الحبوب)
`id` · `recipe_id→recipes` · `material_id`(حليب/كوب/غطاء…) · `qty`(int) · `only_takeaway`(bool — الكوب/الغطاء يُخصم للسفري فقط)
- الحبوب ليست في `recipe_items` — تُحسب من `coffee_grams` على **المحصول المختار** وقت البيع.

### orders — الطلبات
`id` · `business_id` · `branch_id` · `order_number`(int) · `shift_id→shifts` · `employee_id→users` · `status`(enum: `DRAFT`|`PAID`|`COMPLETED`|`VOIDED`|`REFUNDED`) · `fulfillment`(enum: `takeaway`|`dine_in`) · `is_staff`(bool — مشروب موظف) · `subtotal`(int) · `discount`(int, default 0) · `total`(int) · `customer_id`(nullable — خطّاف الولاء) · `created_at` · `paid_at` · `completed_at`
- قيد: `unique(branch_id, order_number)`.
- فهرس: `(branch_id, created_at)` · `(shift_id)` · `(status)`.

### order_items — بنود الطلب
`id` · `order_id→orders` · `product_id` · `crop_material_id→materials`(المحصول المختار) · `unit_price`(int — **مجمّد وقت البيع**) · `qty`(int) · `recipe_snapshot`(jsonb — **لقطة الوصفة المستهلكة**) · `is_free`(bool)

### payments — المدفوعات
`id` · `order_id→orders` · `method`(enum: `cash`|`card`) · `amount`(int) · `tendered`(int nullable — المدفوع) · `change`(int nullable — الباقي) · `card_reference`(text nullable) · `status`(enum: `PENDING`|`CONFIRMED`|`FAILED`) · `idempotency_key`(text) · `created_at`
- قيد: **`unique(idempotency_key)`** — منع الدفع المكرّر على مستوى القاعدة.
- قيد: `check(amount >= 0)`.

### inventory_transactions — دفتر حركات المخزون (Ledger)
`id` · `business_id` · `branch_id` · `material_id→materials` · `type`(enum: `PURCHASE`|`SALE`|`WASTE`|`STAFF`|`ADJUSTMENT`|`COUNT`) · `qty_delta`(int, موجب/سالب بالوحدة الأساس) · `unit_cost`(int nullable — للشراء) · `reason`(enum/text) · `order_id`(nullable) · `count_id`(nullable→stock_counts) · `user_id` · `idempotency_key`(nullable, unique) · `created_at`
- **الرصيد الحقيقي = Σ(qty_delta)**؛ `materials.cached_stock` مجرّد تسريع، **يُحدَّث فقط بإدراج حركة**، ولو اختلفا فالـLedger هو الحقيقة (يُعاد بناؤه منه).
- `WASTE`/`STAFF`: أسباب — `dial_in`|`spill`|`prep_error`|`expired`|`damaged`|`cleaning`|`staff_drink`|`other`.
- فهرس: `(material_id, created_at)` · `(order_id)` · `(branch_id, type, created_at)`.

### stock_counts / stock_count_items — الجرد
`stock_counts`: `id` · `branch_id` · `user_id` · `created_at` · `status`
`stock_count_items`: `id` · `count_id` · `material_id` · `expected`(int) · `counted`(int) · `variance`(int) · `variance_pct`(numeric)
- الجرد **لا يعدّل المخزون مباشرة**: يُنشئ `COUNT` (سجل) ثم النظام يُنشئ **`ADJUSTMENT`** بمقدار الفرق (حركتان منفصلتان).

### shifts — الورديات
`id` · `business_id` · `branch_id` · `employee_id` · `drawer_owner_id→users`(خطّاف تسليم الدرج) · `opening_float`(int) · `opened_at` · `closed_at`(nullable) · `counted_cash`(int nullable) · `expected_cash`(int nullable) · `variance`(int nullable) · `status`(enum: `OPEN`|`CLOSED`)
- قيد: منع ورديتين `OPEN` لنفس الدرج/الفرع (partial unique index حيث `status='OPEN'`).

### cash_movements — حركات الكاش
`id` · `shift_id→shifts` · `type`(enum: `OPENING`|`SALE`|`REFUND`|`EXPENSE`|`DROP`|`REMOVAL`) · `amount`(int موجب/سالب) · `reason` · `user_id` · `created_at`
- `DROP` = سحب أثناء الوردية · `REMOVAL` = سحب مبيعات الإغلاق (تقرير يفرّقهما).

### day_closes — إغلاق اليوم
`id` · `branch_id` · `business_day`(date) · `closed_by` · `closed_at` · `totals`(jsonb)
- بعد الإغلاق: عمليات اليوم لا تُعدَّل إلا بصلاحية `reopen_day` (owner).

### audit_log — سجل التدقيق (+ الموافقات)
`id` · `business_id` · `branch_id` · `user_id`(الفاعل) · `approved_by`(nullable — من وافق) · `action`(enum) · `entity_type` · `entity_id` · `before`(jsonb) · `after`(jsonb) · `reason` · `created_at`
- يُسجَّل: login/logout · void · refund · discount · complimentary · no_sale_open · stock_adjustment · stock_count · price_change · recipe_change · user_change · permission_change · settings_change · pos_lock/unlock · cash_removal.

### settings — الإعدادات (business/branch)
`currency`('IQD') · `staff_drink_limit`(int, default 1) · `low_stock_defaults` · `variance_thresholds`(green≤3, amber≤5, red>5 — قابلة للتغيير) · `notification_prefs` · `session_timeout_minutes`(قفل تلقائي) · `standard_float`.

### roles / role_permissions — (بسيط الآن، جاهز للتوسّع)
دورين مبدئياً؛ الصلاحيات تُدار كقائمة (الجزء ٢). خطّاف: `roles` جدول لإضافة أدوار لاحقاً.

*(مؤجّل — خطاطيف فقط: `customers`, `loyalty_*`, `retail_bags`, `suppliers`, `inventory_batches`, `stock_transfers`, `devices`, `expenses`, `purchases` (V2)، `discounts`.)*

---

# الجزء ٢ — Permission Matrix

| العملية | Owner | Barista |
|---|---|---|
| `sell` (بيع/طلب/دفع) | ✅ | ✅ |
| `open_shift` / `close_shift` | ✅ | ✅ |
| `record_waste` | ✅ | ✅ |
| `staff_drink` (≤ الحدّ) | ✅ | ✅ (الزيادة تحتاج موافقة) |
| `no_sale_open` (فتح درج بلا بيع) | ✅ | ⚠️ مسموح + يُسجَّل (حسب السياسة) |
| `void_draft` (إلغاء قبل الدفع) | ✅ | ✅ |
| `void_paid` (إلغاء بعد الدفع) | ✅ | ❌ يحتاج موافقة المالك |
| `refund` | ✅ | ❌ موافقة |
| `apply_discount` | ✅ | ❌ (أسعار ثابتة) |
| `adjust_inventory` / `stock_count` | ✅ | ❌ |
| `add_stock` / `purchase` | ✅ | ❌ |
| `change_prices` / `manage_products` | ✅ | ❌ |
| `manage_staff` / `change_settings` | ✅ | ❌ |
| `view_reports` (مالية) | ✅ | ❌ |
| `cash_drop` / `cash_removal` | ✅ | ⚠️ Drop حسب السياسة · Removal للمالك |
| `lock_pos` / `unlock_pos` | ✅ | ❌ |
| `day_close` / `reopen_day` | ✅ | ❌ (day_close ممكن للباريستا حسب السياسة) |

**قواعد التطبيق:**
- الفحص **في الخادم** لكل عملية (لا يكفي إخفاء الزر).
- «يحتاج موافقة» = الباريستا يرسل طلباً → المالك يوافق من الموبايل (PIN) → يُنفَّذ ويُسجَّل في `audit_log.approved_by`.
- الصلاحيات مخزّنة كقائمة قابلة للتعديل (تُسند للأدوار) — إضافة دور/صلاحية لاحقاً بلا كود جديد.

---

# الجزء ٣ — State & Transaction Rules

## دورة حياة الطلب
`DRAFT` →(دفع مؤكّد)→ `PAID` →(تلقائي)→ `COMPLETED`
استثناءً: `PAID`→`VOIDED`(بموافقة) · `PAID`→`REFUNDED`(بموافقة). `DRAFT` يُلغى بحرية (بلا أثر مالي/مخزني).

## دورة حياة الدفع (Atomic — القلب)
عند تأكيد الدفع، **معاملة قاعدة بيانات واحدة** بمستوى عزل يمنع التسابق:
1. تحقّق `idempotency_key` غير موجود (قيد فريد) — لو موجود، أرجع النتيجة السابقة (منع تكرار).
2. **اقفل صفوف المواد المطلوبة** (`SELECT … FOR UPDATE`) وأعد التحقق أن الرصيد يكفي (منع مخزون سالب/بيع مزدوج).
3. أدرج `payments`(CONFIRMED) · علّم `orders`=PAID.
4. أدرج `inventory_transactions` (SALE): للمحصول المختار `coffee_grams` + مواد الوصفة (الكوب/الغطاء فقط لو `takeaway`) · حدّث `cached_stock`.
5. لو كاش: أدرج `cash_movements`(SALE +).
6. **Commit**. لو فشلت أي خطوة → **Rollback كامل** (لا دفع، لا خصم). لا حالة نصفية أبداً.
- انقطاع الاتصال قبل Commit → لا CONFIRMED → رسالة «انقطع الاتصال»، والباريستا يعيد بنفس `idempotency_key` (لا تكرار).

## الوردية واليوم
- فتح: `opening_float` → `OPEN` + `cash_movements(OPENING)`.
- `expected_cash = opening_float + Σ(SALE cash) − Σ(REFUND) − Σ(EXPENSE) − Σ(DROP) − Σ(REMOVAL)`.
- إغلاق: **عدّ أعمى** (يُدخل `counted_cash` قبل رؤية المتوقّع) → يُحسب `variance` → `CLOSED`. بلا عدّ → تبقى مفتوحة (استثناء).
- **إغلاق اليوم:** كل ورديات الفرع `CLOSED` → `day_closes` → قفل تعديل اليوم.

## المخزون
- الرصيد من الحركات فقط · `cached_stock` لا يُعدَّل مباشرة (يتغيّر فقط بحركة) · الـLedger مصدر الحقيقة.
- **الجرد:** `COUNT`(المعدود+الفرق) ثم **`ADJUSTMENT`**(±الفرق) — حركتان.
- **الإرجاع لا يرجّع مواد** لمشروبات الكافيه (استُهلكت). *(الأكياس لاحقاً: سياسة إرجاع مستقلة — كيس مغلق يرجع.)*

## القفل الطارئ (Owner Emergency Lock)
- المالك يضغط «قفل الكاشير» → `branches.pos_locked=true` → **يُمنع فتح طلب جديد أو دفع جديد**.
- **الطلب الجاري يُكمَّل عادي** (لا نحرج الباريستا وسط زبون).
- يُسجَّل في `audit_log`. الفتح من المالك فقط. **يدوي فقط — لا قفل تلقائي** على أي فرق.

## قواعد التكامل (تُفرَض في القاعدة، لا الواجهة)
- الفلوس والكميات **أعداد صحيحة**.
- `unique(payments.idempotency_key)` · `unique(branch_id, order_number)` · `unique(product_id, material_id)`.
- `check(refund_amount ≤ paid_amount)` · `check(qty ≥ 0)` حيث يلزم.
- لا طلب بلا فرع · لا دفع بلا طلب · لا بند بلا منتج · لا حركة مخزون بلا سبب.
- `order_number` بتسلسل ذرّي لكل فرع (sequence/counter مقفول) — بلا فجوات مكرّرة.
- **PIN:** مُهشّر (bcrypt) + **حدّ محاولات** (قفل بعد N فشل) — 4 أرقام ضعيفة بلا حدّ. المالك دخول أقوى.
- **اليوم المحاسبي:** يُعرّفه `day_close` (لا منتصف الليل الجامد) — التقارير على حدوده.

## التنبيهات (للحرِج فقط)
🔴 refund · void بعد دفع · فرق درج/مخزون عالٍ · تعديل مخزون · مجاني كبير · محاولة غير مصرّح بها.
🟡 مخزون منخفض · هدر عالٍ · كثرة إلغاءات. **البيع/الهدر/مشروب الموظف الطبيعي = بلا إشعار.**

---
**قاعدة ذهبية للبناء:** أي غموض يُحسم بالنقاش قبل الكود — لا اجتهاد أثناء البرمجة.
