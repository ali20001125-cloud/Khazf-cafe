# KHAZAF POS — المواصفة التقنية

> **ما هذه الوثيقة:** ترجمة قواعد العمل (`docs/CAFE-POS-SPEC.md` وقرارات المالك)
> إلى مواصفة تنفيذية لا تحتاج اجتهاداً أثناء البرمجة: مخطّط، قيود، آلات حالة،
> صيغ حساب، نقاط نهاية، وحالات اختبار.
>
> **مبنيّة على قاعدة Neon الحالية**، لا على مخطّط جديد: مشروع `khazf-cafe`
> (`gentle-sound-96904023`, PG 17, فرانكفورت). ٢٨ جدولاً قائماً + ما تضيفه
> الهجرات `0009`–`0016`. كل ما هنا **طُبِّق واختُبر فعلاً** على نسخة مطابقة
> من المخطّط (النتائج في §19).
>
> **القاعدة الحاكمة (المواصفة §66):** الواجهة ليست مصدر الحماية. كل قاعدة في
> هذه الوثيقة مفروضة في الخادم أو في قاعدة البيانات — والأفضل في القاعدة، لأنها
> تصمد حتى لو أُخطئ في الخادم.

## الفهرس

| # | القسم | # | القسم |
|---|---|---|---|
| 1 | [اتفاقيات عامة](#1-اتفاقيات-عامة) | 11 | [قواعد دفتر المخزون](#11-قواعد-دفتر-المخزون) |
| 2 | [مخطّط PostgreSQL](#2-مخطّط-postgresql) | 12 | [صيغ حساب الكاش](#12-صيغ-حساب-الكاش) |
| 3 | [الجداول والأعمدة](#3-الجداول-والأعمدة) | 13 | [نقاط النهاية / Server Actions](#13-نقاط-النهاية--server-actions) |
| 4 | [المفاتيح الخارجية](#4-المفاتيح-الخارجية) | 14 | [قواعد التحقّق](#14-قواعد-التحقّق) |
| 5 | [الفهارس](#5-الفهارس) | 15 | [حدود المعاملات](#15-حدود-المعاملات) |
| 6 | [استراتيجية التخويل](#6-استراتيجية-التخويل) | 16 | [منع التكرار (Idempotency)](#16-منع-التكرار-idempotency) |
| 7 | [مصفوفة الصلاحيات](#7-مصفوفة-الصلاحيات) | 17 | [أحداث التدقيق](#17-أحداث-التدقيق) |
| 8 | [آلة حالة الطلب](#8-آلة-حالة-الطلب) | 18 | [معالجة الأخطاء](#18-معالجة-الأخطاء) |
| 9 | [آلة حالة الدفع والوردية](#9-آلة-حالة-الدفع-والوردية) | 19 | [حالات الاختبار](#19-حالات-الاختبار) |
| 10 | [آلة حالة الولاء](#10-آلة-حالة-الولاء) | 20 | [اختبارات الأمن](#20-اختبارات-الأمن) |

---

## 1. اتفاقيات عامة

| البند | القاعدة |
|---|---|
| **المال** | عدد صحيح، دينار عراقي كامل. لا `float`، لا كسور، لا عملة ثانية. |
| **الكميات** | عدد صحيح بالوحدة الأساس: `g` · `ml` · `pcs`. الإدخال بالكيلو/اللتر يُحوَّل في الواجهة (`toBase`)، والقاعدة لا ترى إلا الوحدة الأساس. |
| **المعرّفات** | `uuid` داخلي · `orders.order_number` عدد مقروء متسلسل لكل فرع يبدأ من 1001. لا يُستخدم معرّف قاعدة البيانات كرقم فاتورة (المواصفة §19). |
| **الوقت** | `timestamptz` من **ساعة الخادم** (`now()`) دائماً. لا وقت من جهاز الباريستا (§52). العرض بتوقيت الفرع (`branches.timezone`، افتراضه `Asia/Baghdad`). |
| **اليوم المحاسبي** | `(created_at at time zone branches.timezone)::date`. حدوده يقفلها `day_closes`، لا منتصف الليل الجامد (§53). |
| **الفرع** | كل صفّ تشغيلي يحمل `branch_id` — الطلبات، الورديات، الكاش، الدفتر، الجرد، الهدر، فتح الدرج (§6). |
| **لا حذف** | المنتجات والمستخدمون يُعطَّلون (`active=false`). العمليات المالية والمخزنية **لا تُحذف ولا تُعدَّل** — التصحيح بعملية عكسية موثّقة. |
| **اللغة** | أسماء الجداول والأعمدة إنجليزية، ونصوص الأخطاء عربية (تصل الباريستا كما هي). |

---

## 2. مخطّط PostgreSQL

### 2.1 نقطة البداية

القاعدة الحيّة فيها **٢٨ جدولاً** تغطّي المبيعات والمخزون والورديات والكاش
والصلاحيات. الهجرات الجديدة **إضافية بالكامل**: لا جدول يُحذف، ولا عمود
يُعاد تسميته، ولا نوع تُحذف منه قيمة. المخطّط القديم يبقى صالحاً والتطبيق
الحالي يستمرّ في العمل أثناء الانتقال.

### 2.2 ترتيب التطبيق

| # | الملفّ | ما يفعله |
|---|---|---|
| 0001–0008 | (مطبَّقة على الحيّ) | المخطّط · الدخول · الدفع · المخزون · مشروب الموظف · الخيارات · دفع v2 · تصحيح صلاحيات |
| **0009** | `0009_permissions_v2.sql` | كتالوج الصلاحيات المنقّطة + إسناد الأدوار |
| **0010** | `0010_enums.sql` | توسيع الأنواع — ⚠️ **جملة‑جملة، خارج معاملة واحدة** |
| **0011** | `0011_integrity.sql` | مصالحة الأرصدة · الدفتر للإلحاق فقط · حارس الرصيد · آلات الحالة · قفل اليوم |
| **0012** | `0012_orders_v2.sql` | نوع الطلب · تاريخ الأسعار · الخصومات · الإلغاء · الإرجاع |
| **0013** | `0013_cash_v2.sql` | فتح الدرج بلا بيع · تسليم الدرج · الإغلاق الأعمى · سحب المبيعات |
| **0014** | `0014_loyalty.sql` | الولاء كاملاً: OTP · الحسابات · الدفتر · المكافآت · الكسب · الصرف |
| **0015** | `0015_checkout_v3.sql` | البيع v3 ومشروب الموظف بلا تحديث يدوي للرصيد |
| **0016** | `0016_reports.sql` | الاستهلاك النظري · الفروقات · النمط · لوحات المالك · الاستثناءات |

> **0011 و0015 توأمان.** قبلهما كانت دوال البيع تُحدّث `materials.cached_stock`
> بنفسها. بعد 0011 صار مُشغّل الدفتر هو من يفعل ذلك، و0015 يحذف التحديث اليدوي.
> تطبيق 0011 وحده = **خصم مزدوج للمخزون**. طبّقهما معاً أو لا تطبّق أيّاً منهما.

### 2.3 الأنواع (enums)

| النوع | القيم | ملاحظة |
|---|---|---|
| `user_role` / `employee_role` | `owner` · `barista` | الأدوار الفعلية في `roles`، وهذا للتوافق |
| `material_unit` | `g` · `ml` · `pcs` | |
| `order_status` | `DRAFT` · `PENDING_PAYMENT` · `PAID` · `COMPLETED` · `VOIDED` · `REFUNDED` · `PARTIALLY_REFUNDED` · `CANCELLED` | الثلاثة الأخيرة أضافها 0010 |
| `order_type` | `SALE` · `LOYALTY_REWARD` · `STAFF_DRINK` · `COMPLIMENTARY` | جديد (0012) |
| `fulfillment_type` | `takeaway` · `dine_in` | يحكم خصم الكوب والغطاء |
| `payment_method` | `cash` · `card` · `loyalty` | `loyalty` جديد (0010) — مبلغه 0 دائماً |
| `payment_status` | `PENDING` · `CONFIRMED` · `FAILED` | |
| `refund_status` | `PENDING` · `APPROVED` · `REJECTED` · `COMPLETED` | جديد (0012) |
| `discount_kind` | `PERCENT` · `AMOUNT` · `COMP` | جديد (0012) |
| `inv_txn_type` | `PURCHASE` · `SALE` · `WASTE` · `STAFF` · `ADJUSTMENT` · `COUNT` · `LOYALTY_REWARD` · `TRANSFER_IN` · `TRANSFER_OUT` · `OTHER_APPROVED` | الأربعة الأخيرة جديدة |
| `cash_movement_type` | `OPENING` · `SALE` · `REFUND` · `EXPENSE` · `DROP` · `REMOVAL` | |
| `shift_status` | `OPEN` · `CLOSED` | |
| `handover_status` | `PENDING` · `CONFIRMED` · `CANCELLED` | جديد (0013) |
| `loyalty_ledger_type` | `EARN` · `EARN_REVERSAL` · `REWARD_ISSUED` · `REWARD_REDEEMED` · `REWARD_CANCELLED` · `ADJUSTMENT` | جديد (0014) |
| `reward_status` | `AVAILABLE` · `REDEEMED` · `CANCELLED` · `EXPIRED` | جديد (0014) |
| `count_status` | `OPEN` · `COMPLETED` | |

**مرادفان مثبتان** (لم تُعَد التسمية حتى لا ينكسر كود التطبيق القائم):

| في المواصفة | في القاعدة |
|---|---|
| `STAFF_DRINK` (§30) | `STAFF` |
| `COUNT_ADJUSTMENT` (§36) | `ADJUSTMENT` |

**نوع غير مستعمل:** `waste_reason` موجود في القاعدة منذ 0001 لكن
`inventory_transactions.reason` عمود `text` لا يستعمله. أسباب الهدر (§29)
تُفرَض في طبقة الخادم من قائمة ثابتة: `dial_in` · `calibration` · `spill` ·
`failed_shot` · `spoilage` · `damaged` · `other`.

---

## 3. الجداول والأعمدة

### 3.1 الأساس والهوية

**`businesses`** — `id` uuid pk · `name` text · `created_at` timestamptz

**`branches`** — `id` · `business_id` · `name` · `timezone` (افتراضه `Asia/Baghdad`) ·
`standard_float` int ≥0 · `pos_locked` bool · `variance_threshold_pct` numeric(5,2)
افتراضه 3.00 (جديد) · `active` bool · `created_at`

**`users`** — `id` · `business_id` · `name` · `role` · **`pin_hash`** (bcrypt، لا PIN صريح) ·
`active` · `failed_pin_attempts` int · `locked_until` timestamptz · `last_login_at` · `created_at`

**`user_branch_access`** — `(user_id, branch_id)` pk — أي فرع يخدم فيه الموظف.

**`roles`** — `id` · `business_id` · `key` · `name` · unique(`business_id`,`key`)
**`role_permissions`** — `(role_id, permission)` pk
**`permissions`** (جديد) — `key` pk · `scope` · `label` (عربي للعرض) · `sensitive` bool · `legacy_key`

**`settings`** — `id` · `business_id` · `branch_id` (null = على مستوى العمل) · `key` · `value` jsonb · `note`

### 3.2 الكتالوج والوصفات

**`products`** — `id` · `business_id` · `name` · `category` · `active` · `paused` ·
`daily_limit` int? · `is_daily_special` · `sort` · **`loyalty_eligible`** bool (جديد) · `created_at`

**`product_crops`** — `id` · `product_id` · `material_id` (الحبوب) · `price` int ≥0 ·
`available` · unique(`product_id`,`material_id`)
> صفّ واحد ⇒ المحصول تلقائي · أكثر ⇒ الاختيار إجباري (§14).

**`recipes`** — `id` · `product_id` · `version` · `coffee_grams` int ≥0 · `active` ·
unique(`product_id`,`version`) + **unique جزئي على `product_id` حيث `active`** (وصفة فعّالة واحدة)

**`recipe_items`** — `id` · `recipe_id` · `material_id` · `qty` int >0 · `only_takeaway` bool
> الحبوب ليست هنا: تُحسب من `coffee_grams` على **المحصول المختار** وقت البيع.

**`modifier_groups` / `modifier_options` / `product_modifier_groups`** — الخيارات والإضافات.
الخيار يفعل واحداً من ثلاثة: `add_to_crop_grams` (شوت زائد) · `replaces_base_material_id`
(استبدال الحليب) · `material_id`+`qty` (سيروب).

**`materials`** — `id` · `business_id` · `name` · `base_unit` · `low_threshold` ·
`current_cost` int (متوسط مرجّح لكل وحدة أساس) · **`cached_stock` int — مشتقّ، لا يُكتب مباشرة** ·
**`allow_negative`** bool (جديد) · **`dose_grams`** int? (جديد — للتحويل «الفرق ≈ N جرعة») ·
`active` · `created_at`

**`price_history`** (جديد) — `id` · `business_id` · `product_id` · `material_id` ·
`old_price` · `new_price` · `changed_by` · `reason` · `created_at`
> يُملأ بمُشغّل على `product_crops`. الفاعل يأتي من `set_config('khazaf.actor', <user_id>, true)`.

### 3.3 الطلبات والمال

**`order_counters`** — `branch_id` pk · `next_number` int افتراضه 1001.
> عدّاد لكل فرع يتقدّم **بعد** اجتياز كل التحقّقات ⇒ لا فجوات في أرقام الفواتير.

**`orders`** — `id` · `business_id` · `branch_id` · `order_number` · `shift_id` · `employee_id` ·
`customer_id` · `status` · **`order_type`** (جديد) · `fulfillment` · `is_staff` (مهجور) ·
`subtotal` ≥0 · `discount` ≥0 · `total` ≥0 · `created_at` · `paid_at` · `completed_at`
- unique(`branch_id`,`order_number`)
- check: `order_type = 'LOYALTY_REWARD'` ⇒ `total = 0` (§43)

**`order_items`** — `id` · `order_id` · `product_id` · `crop_material_id` ·
**`unit_price` مجمَّد وقت البيع** · `qty` >0 · **`recipe_snapshot` jsonb** · `is_free` · `created_at`

`recipe_snapshot` يحفظ: `coffee_grams` · `crop_material_id` · `takeaway` · `options[]` ·
`items[]` (كل مادة وكميتها). تغيير الوصفة أو السعر لاحقاً **لا يمسّ الطلبات القديمة** (§8 · §10).

**`order_item_modifiers`** — `id` · `order_item_id` · `option_id` · `name` · `price_delta`

**`payments`** — `id` · `order_id` · `method` · `amount` ≥0 · `tendered` ≥0 · `change` ≥0 ·
`card_reference` · `status` · **`idempotency_key` unique** · `created_at`

**`order_discounts`** (جديد) — `id` · `order_id` · `order_item_id?` · `kind` · `value` ·
`amount` · `original_total` · `final_total` · `reason` (إلزامي) · `applied_by` · `approved_by` · `created_at`
- check: `PERCENT` ⇒ `value` بين 0 و100 · check: `final_total = original_total − amount`
> **الخصم ليس تعديل سعر** (§48): البند يحتفظ بسعره، والخصم وثيقة مستقلّة.

**`order_voids`** (جديد) — `id` · `order_id` **unique** · `reason` · `voided_by` · `approved_by` · `created_at`

**`refunds`** (جديد) — `id` · `business_id` · `branch_id` · `order_id` · `shift_id?` ·
`amount` >0 · `method` · `reason` · `requested_by` · `approved_by` · `status` ·
**`idempotency_key` unique** · `created_at` · `completed_at`

**`refund_items`** (جديد) — `id` · `refund_id` · `order_item_id` · `qty` >0 · `amount` ≥0 ·
unique(`refund_id`,`order_item_id`)

### 3.4 المخزون

**`inventory_transactions`** — دفتر الحقيقة:
`id` · `business_id` · `branch_id` · `material_id` · `type` · **`qty_delta`** (± بالوحدة الأساس) ·
`unit_cost` ≥0 · `reason` (إلزامي) · `order_id?` · `count_id?` · `user_id` (إلزامي) ·
`idempotency_key` unique · `created_at`

**`stock_counts`** — `id` · `branch_id` · `user_id` · `status` · `created_at`
**`stock_count_items`** — `id` · `count_id` · `material_id` · `expected` · `counted` · `variance` · `variance_pct`

### 3.5 الكاش والورديات

**`shifts`** — `id` · `business_id` · `branch_id` · `employee_id` · `drawer_owner_id` ·
`opening_float` ≥0 · `opened_at` · `closed_at` · `counted_cash` · `expected_cash` ·
`variance` · `status` · `created_at`
- **unique جزئي على `branch_id` حيث `status='OPEN'`** — وردية مفتوحة واحدة لكل فرع.

**`cash_movements`** — `id` · `shift_id` · **`branch_id`** (جديد، NOT NULL) · `type` ·
`amount` (± ) · `reason` · `user_id` · `created_at`
- check الإشارة: `OPENING`/`SALE` ≥ 0 · `DROP`/`REMOVAL`/`EXPENSE`/`REFUND` ≤ 0

**`no_sale_opens`** (جديد) — `id` · `business_id` · `branch_id` · `shift_id?` · `user_id` ·
`reason` (إلزامي) · `created_at`

**`drawer_handovers`** (جديد) — `id` · `branch_id` · `shift_id` · `from_user_id` · `to_user_id` ·
`counted_cash` ≥0 · `expected_cash?` · `variance?` · `status` · `created_at` · `confirmed_at`
- check: `from_user_id <> to_user_id` · unique جزئي: تسليم معلّق واحد لكل وردية

**`day_closes`** — `id` · `branch_id` · `business_day` date · `closed_by` · `closed_at` ·
`totals` jsonb · unique(`branch_id`,`business_day`)

### 3.6 الولاء

**`customers`** — `id` · `business_id` · `phone` (إلزامي، unique مع `business_id`) · `name` ·
**`phone_verified_at`** · **`source`** · **`blocked`** · `created_at`

**`otp_codes`** (جديد) — `id` · `business_id` · `phone` · **`code_hash`** (bcrypt) ·
`attempts` · `expires_at` · `consumed_at` · `created_at` · unique جزئي: رمز نشط واحد لكل رقم

**`loyalty_accounts`** (جديد) — `id` · `business_id` · `customer_id` **unique** · `status` · `created_at`

**`loyalty_ledger`** (جديد) — `id` · `business_id` · `account_id` · `type` · **`stamps_delta`** ·
`order_id?` · `order_item_id?` · `reward_id?` · `reason` · `user_id?` ·
`idempotency_key` unique · `created_at`
> **الرصيد = Σ(stamps_delta)** (§46). لا عمود `stamps` قابل للتعديل في أي مكان.

**`loyalty_rewards`** (جديد) — `id` · `business_id` · `account_id` · `kind` · `status` ·
`issued_at` · `expires_at?` · `redeemed_at?` · **`redeemed_order_id` unique** · `redeemed_by?`

### 3.7 التدقيق

**`audit_log`** — `id` · `business_id` · `branch_id` · `user_id` (الفاعل) · `approved_by` ·
`action` · `entity_type` · `entity_id` · `before` jsonb · `after` jsonb · `reason` · `created_at`

---

## 4. المفاتيح الخارجية

كل مفتاح خارجي بلا `ON DELETE CASCADE` **عمداً**: لا شيء في هذا النظام يُحذف
بالتتالي. محاولة حذف صفّ مرجعيّ تفشل، وهذا هو المطلوب.

| من | إلى | يمنع |
|---|---|---|
| `orders.branch_id` → `branches` | NOT NULL | طلب بلا فرع (§58) |
| `orders.business_id` → `businesses` | NOT NULL | |
| `orders.employee_id` → `users` | NOT NULL | عملية بلا فاعل (§58) |
| `orders.shift_id` → `shifts` | nullable | (طلب خارج وردية ممكن، ويُرصد) |
| `orders.customer_id` → `customers` | nullable | |
| `order_items.order_id` → `orders` | NOT NULL | بند بلا طلب (§58) |
| `order_items.product_id` → `products` | NOT NULL | بند بلا منتج |
| `order_items.crop_material_id` → `materials` | nullable | |
| `payments.order_id` → `orders` | NOT NULL | **دفع بلا طلب (§58)** |
| `order_discounts.order_id` → `orders` · `.applied_by` → `users` | NOT NULL | خصم بلا فاعل |
| `order_voids.order_id` → `orders` (unique) · `.voided_by` → `users` | NOT NULL | إلغاء مكرّر أو مجهول |
| `refunds.order_id` → `orders` · `.requested_by` → `users` | NOT NULL | إرجاع بلا بيع أصلي |
| `refund_items.refund_id` → `refunds` · `.order_item_id` → `order_items` | NOT NULL | |
| `inventory_transactions.material_id` → `materials` | NOT NULL | **حركة بلا مادة (§58)** |
| `inventory_transactions.branch_id` → `branches` | NOT NULL | **حركة بلا فرع (§58)** |
| `inventory_transactions.user_id` → `users` | NOT NULL | **حركة بلا مسؤول (§58)** |
| `inventory_transactions.order_id` → `orders` · `.count_id` → `stock_counts` | nullable | |
| `cash_movements.shift_id` → `shifts` · `.branch_id` → `branches` · `.user_id` → `users` | NOT NULL | حركة نقد بلا وردية أو فاعل |
| `shifts.branch_id`/`business_id`/`employee_id` | NOT NULL | |
| `shifts.drawer_owner_id` → `users` | nullable | |
| `no_sale_opens.branch_id`/`user_id` | NOT NULL | فتح درج مجهول (§28) |
| `drawer_handovers.from_user_id`/`to_user_id` → `users` | NOT NULL | |
| `loyalty_accounts.customer_id` → `customers` (unique) | NOT NULL | حسابا ولاء لعميل واحد |
| `loyalty_ledger.account_id` → `loyalty_accounts` · `.reward_id` → `loyalty_rewards` | | |
| `loyalty_rewards.redeemed_order_id` → `orders` **unique** | nullable | **صرف المكافأة مرّتين (§45)** |
| `price_history.product_id`/`material_id` | NOT NULL | |
| `audit_log.user_id`/`approved_by` → `users` | nullable | |

---

## 5. الفهارس

**قائمة (موجودة):** `branches(business_id)` · `users(business_id, active)` ·
`materials(business_id, active)` · `products(business_id, active)` ·
`product_crops(product_id)` · `product_crops(material_id)` · `recipes(product_id)` ·
`recipe_items(recipe_id)` · `modifier_options(group_id)` ·
`orders(branch_id, created_at)` · `orders(shift_id)` · `orders(status)` ·
`order_items(order_id)` · `order_item_modifiers(order_item_id)` · `payments(order_id)` ·
`inventory_transactions(material_id, created_at)` · `(order_id)` · `(branch_id, type, created_at)` ·
`cash_movements(shift_id, created_at)` · `shifts(branch_id, opened_at)` ·
`stock_counts(branch_id, created_at)` · `stock_count_items(count_id)` ·
`audit_log(business_id, created_at)` · `audit_log(action)`

**فريدة (تفرض قواعد عمل، لا أداءً فقط):**

| الفهرس | القاعدة التي يفرضها |
|---|---|
| `orders(branch_id, order_number)` | لا رقم فاتورة مكرّر (§58) |
| `payments(idempotency_key)` | **لا دفع مكرّر (§18 · §60)** |
| `inventory_transactions(idempotency_key)` | لا خصم مخزون مكرّر |
| `refunds(idempotency_key)` | لا إرجاع مكرّر |
| `loyalty_ledger(idempotency_key)` | لا كسب/صرف مكرّر |
| `loyalty_rewards(redeemed_order_id)` | **لا مكافأة تُصرف مرّتين (§45)** |
| `product_crops(product_id, material_id)` | محصول واحد مرّة واحدة لكل مشروب |
| `recipes(product_id) WHERE active` | وصفة فعّالة واحدة لكل مشروب |
| `shifts(branch_id) WHERE status='OPEN'` | وردية مفتوحة واحدة لكل فرع |
| `drawer_handovers(shift_id) WHERE status='PENDING'` | تسليم معلّق واحد |
| `otp_codes(business_id, phone) WHERE consumed_at IS NULL` | رمز تحقّق نشط واحد |
| `day_closes(branch_id, business_day)` | إغلاق واحد لليوم |
| `settings(business_id, key) WHERE branch_id IS NULL` · `(business_id, branch_id, key)` | إعداد واحد لكل مفتاح |
| `customers(business_id, phone)` | رقم هاتف واحد لكل عميل |

**جديدة (0012–0014):** `orders(branch_id, order_type, created_at)` ·
`orders(customer_id) WHERE NOT NULL` · `order_discounts(order_id)` ·
`refunds(order_id)` · `refunds(branch_id, created_at)` · `refund_items(refund_id)` ·
`price_history(product_id, created_at DESC)` · `cash_movements(branch_id, created_at)` ·
`no_sale_opens(branch_id, created_at)` · `drawer_handovers(shift_id, created_at)` ·
`loyalty_ledger(account_id, created_at)` · `loyalty_ledger(order_id)` ·
`loyalty_rewards(account_id, status)` · `loyalty_accounts(business_id)` ·
`otp_codes(business_id, phone, created_at DESC)` · `role_permissions(permission)`

---

## 6. استراتيجية التخويل

### 6.1 لماذا لا RLS

Row Level Security أداة لقاعدة **مكشوفة للعميل** (مفتاح anon، واجهة REST عامة).
هنا الوضع مختلف: قاعدة Neon لا تُلمس إلا من الخادم برابط سرّي، ولا واجهة عامة
ولا مفتاح مجهول (`src/lib/db.ts` معلَّم `server-only`). في هذا النموذج RLS يضيف
تعقيداً بلا حماية إضافية: من يملك رابط الاتصال يملك دور التطبيق أصلاً.

**البديل المعتمد — دفاع بثلاث طبقات:**

| الطبقة | ما تمنعه | كيف |
|---|---|---|
| **1. الواجهة** | الضغط الخاطئ | إخفاء الأزرار — **راحة، لا حماية** |
| **2. الخادم** | الطلب المباشر بلا صلاحية | `requirePermission(...)` أول سطر في كل Server Action |
| **3. القاعدة** | الخطأ البرمجي والتلاعب المباشر | قيود ومُشغّلات: الدفتر للإلحاق فقط، الرصيد لا يُكتب مباشرة، آلات الحالة، سقف الإرجاع، المكافأة مرّة واحدة |

الطبقة الثالثة هي التي تصمد لو أُخطئ في الثانية — وهي مقصد المواصفة §66.

### 6.2 لو انتقل النظام لواجهة قاعدة عامة لاحقاً

عندها RLS إلزامي: `business_id`/`branch_id` من `current_setting('request.jwt.claims')`،
وسياسة `SELECT`/`INSERT` لكل جدول تشغيلي، ومنع `UPDATE`/`DELETE` على الدفاتر
نهائياً. **حتى ذلك الحين لا تُفعَّل** — سياسة نصف مطبَّقة أسوأ من لا سياسة.

### 6.3 كيف يُفحص التخويل

```
requireUser()          → جلسة كوكي موقّعة (HMAC) صالحة، وإلا 401
requirePermission(k)   → role_permissions تحوي k للدور، وإلا 403
```

الصلاحيات تُقرأ من `role_permissions` (كاش بالذاكرة، يُفرَّغ عند التعديل)،
لا من `if (role === 'barista')`. إضافة دور أو صلاحية = صفوف في القاعدة، لا كود.

### 6.4 مفاتيح الجلسة والقاعدة

| المفتاح | من يضبطه | لماذا |
|---|---|---|
| `khazaf.actor` | الخادم قبل تعديل السعر | يُسجَّل في `price_history.changed_by` |
| `khazaf.reason` | الخادم قبل تعديل السعر | سبب التغيير |
| `khazaf.reopen` | الخادم عند إعادة فتح يوم (`day.reopen`) | يتجاوز قفل اليوم — **يُسجَّل في `audit_log` دائماً** |
| `khazaf.ledger` | مُشغّل الدفتر داخلياً | لا يضبطه كود التطبيق أبداً |

### 6.5 المفاتيح المنقّطة والمرادفات القديمة

الكتالوج الجديد منقّط بنطاق (`orders.create`, `payments.refund`, …). المفاتيح
المسطّحة القديمة تبقى مُسندة للمالك حتى ينتقل كود التطبيق، ثم تُحذف.

| المنقّط الجديد | المسطّح القديم |
|---|---|
| `orders.create` · `payments.create` | `sell` |
| `payments.refund` | `refund` |
| `payments.void` | `void_paid` |
| `orders.void_draft` | `void_draft` |
| `discounts.apply` | `apply_discount` |
| `cash.open_shift` / `cash.close_shift` | `open_shift` / `close_shift` |
| `cash.drop` / `cash.remove` / `cash.no_sale_open` | `cash_drop` / `cash_removal` / `no_sale_open` |
| `inventory.receive` / `.count` / `.adjust` / `.waste` | `add_stock` / `stock_count` / `adjust_inventory` / `record_waste` |
| `staff_drinks.create` | `staff_drink` |
| `products.manage` / `recipes.manage` / `prices.manage` | `manage_products` / `change_prices` |
| `reports.financial` | `view_reports` |
| `users.manage` / `settings.manage` / `pos.lock` | `manage_staff` / `change_settings` / `lock_pos` |
| `day.close` / `day.reopen` | `day_close` / `reopen_day` |
| بلا مقابل قديم | `orders.view_own` · `orders.view_all` · `orders.reprint` · `cash.count` · `cash.view_expected` · `cash.handover` · `inventory.view` · `loyalty.*` · `reports.view` · `branches.manage` · `audit.view` · `approvals.grant` · `staff_drinks.approve` · `discounts.apply_sensitive` |

---

## 7. مصفوفة الصلاحيات

**قاعدة القراءة:** ✅ يملكها · ❌ لا يملكها · ⚠️ بموافقة المالك.

| النطاق | الصلاحية | Owner | Barista | ملاحظة |
|---|---|:--:|:--:|---|
| **orders** | `orders.create` | ✅ | ✅ | |
| | `orders.edit_before_payment` | ✅ | ✅ | قبل الدفع فقط |
| | `orders.view_own` | ✅ | ✅ | طلباته هو |
| | `orders.view_all` | ✅ | ❌ | |
| | `orders.reprint` | ✅ | ✅ | §21 — لا طلب جديد |
| | `orders.void_draft` | ✅ | ✅ | بلا أثر مالي |
| **payments** | `payments.create` | ✅ | ✅ | |
| | `payments.refund` | ✅ | ⚠️ | §50 |
| | `payments.void` | ✅ | ⚠️ | §49 — بعد الدفع |
| **discounts** | `discounts.apply` | ✅ | ❌ | الأسعار ثابتة |
| | `discounts.apply_sensitive` | ✅ | ❌ | §48 |
| **cash** | `cash.open_shift` · `cash.close_shift` · `cash.count` | ✅ | ✅ | |
| | `cash.handover` | ✅ | ✅ | §27 |
| | `cash.drop` | ✅ | ❌ | §24 |
| | `cash.remove` | ✅ | ❌ | §25 |
| | **`cash.view_expected`** | ✅ | ❌ | **§26 — عماء العدّ** |
| | `cash.no_sale_open` | ✅ | ❌ | §28 |
| **inventory** | `inventory.view` | ✅ | ❌ | الباريستا لا يرى الأرصدة |
| | `inventory.waste` | ✅ | ✅ | §29 |
| | `inventory.receive` · `.count` · `.adjust` | ✅ | ❌ | |
| **staff** | `staff_drinks.create` | ✅ | ✅ | ضمن الحدّ · الزيادة ⚠️ |
| | `staff_drinks.approve` | ✅ | ❌ | |
| **catalog** | `products.manage` · `recipes.manage` · `prices.manage` | ✅ | ❌ | §31 |
| **loyalty** | `loyalty.view_customer` | ✅ | ✅ | أختام ومكافآت فقط |
| | `loyalty.redeem` | ✅ | ✅ | §42 |
| | `loyalty.manage` | ✅ | ❌ | **لا إنشاء حساب ولا تعديل رصيد (§38 · §41)** |
| **reports** | `reports.view` | ✅ | ❌ | |
| | `reports.financial` | ✅ | ❌ | **§20 — لا إجماليات للباريستا** |
| **admin** | `users.manage` · `branches.manage` · `settings.manage` | ✅ | ❌ | |
| | `audit.view` | ✅ | ❌ | ولا أحد يعدّله |
| | `pos.lock` · `approvals.grant` | ✅ | ❌ | |
| **day** | `day.close` | ✅ | ❌ | |
| | `day.reopen` | ✅ | ❌ | يُسجَّل دائماً |

**ما لا يراه الباريستا أبداً** (§3 · §20 · §26 · §44): إجمالي مبيعات اليوم ·
إجمالي الكاش · إيراد البطاقة · النقد المتوقّع · فرق الدرج · تكلفة المواد ·
أرباح · تقارير مالية · أرصدة المخزون.

يرى: طلباته وعددها · مبلغ **الطلب الحالي** والباقي · حالة وردية مفتوحة/مغلقة ·
أختام العميل ومكافآته.

**«يحتاج موافقة» كيف تعمل:** الباريستا يطلب → المالك يوافق (PIN من الموبايل)
→ تُنفَّذ العملية ويُسجَّل `audit_log.approved_by`. لا موافقة ⇒ لا تنفيذ.

---

## 8. آلة حالة الطلب

```
                    ┌──────────────────────────────┐
                    │            DRAFT             │  لا خصم مخزون · ليس بيعاً
                    └──┬──────────┬─────────┬──────┘
                       │          │         │
             ┌─────────▼──┐  ┌────▼─────┐   └──────────► CANCELLED  (نهائية)
             │PENDING_    │  │   PAID   │
             │ PAYMENT    │  └────┬─────┘
             └──┬───────┬─┘       │
                │       └─────────┤
                │                 ▼
                │           ┌───────────┐
                └──────────►│ COMPLETED │
                            └─┬───┬───┬─┘
                              │   │   │
       ┌──────────────────────┘   │   └────────────────┐
       ▼                          ▼                    ▼
   VOIDED (نهائية)   PARTIALLY_REFUNDED ──────►   REFUNDED (نهائية)
                              ▲   │
                              └───┘  (إرجاع جزئي آخر)
```

**جدول الانتقالات المسموحة** (مفروض بمُشغّل `orders_status_guard`):

| من | إلى المسموح |
|---|---|
| `DRAFT` | `PENDING_PAYMENT` · `PAID` · `COMPLETED` · `CANCELLED` |
| `PENDING_PAYMENT` | `DRAFT` · `PAID` · `COMPLETED` · `CANCELLED` |
| `PAID` | `COMPLETED` · `VOIDED` · `REFUNDED` · `PARTIALLY_REFUNDED` |
| `COMPLETED` | `VOIDED` · `REFUNDED` · `PARTIALLY_REFUNDED` |
| `PARTIALLY_REFUNDED` | `PARTIALLY_REFUNDED` · `REFUNDED` |
| `VOIDED` · `REFUNDED` · `CANCELLED` | **نهائية — لا خروج منها** |

أي انتقال آخر يرفع `restrict_violation` في القاعدة، لا في الخادم.

**قواعد ملازمة:**
- `DRAFT` لا يخصم مخزوناً ولا يُحتسب بيعاً ولا يمنح ولاءً. إلغاؤه حرّ.
- `checkout` ينشئ الطلب مباشرة بـ`COMPLETED` (بيع الكاونتر لحظي: الدفع والتسليم معاً).
  الحالات الوسيطة موجودة للتدفّقات المستقبلية (طلب مفتوح، دفع بطاقة معلّق).
- **بعد الدفع لا يوجد Delete** (§49): `VOIDED` بوثيقة في `order_voids`.
- الإرجاع **لا يُعيد المواد للمخزون** (§50): استُهلكت فعلاً.

---

## 9. آلة حالة الدفع والوردية

### 9.1 الدفع

```
   PENDING ──► CONFIRMED  (نهائية)
      └──────► FAILED     (نهائية)
```

| القاعدة | الفرض |
|---|---|
| `CONFIRMED`/`FAILED` نهائيتان | مُشغّل `payments_guard` |
| `order_id` · `amount` · `method` · `idempotency_key` لا تُعدَّل بعد الإدراج | مُشغّل `payments_guard` |
| **لا حذف لأي دفعة** | مُشغّل `payments_guard` |
| كاش: `tendered ≥ total`، و`change = tendered − total` | داخل `checkout` (§17) |
| بطاقة: لا `CONFIRMED` قبل تأكيد نجاح الدفع (§18) | طبقة الخادم |
| مكافأة: `method='loyalty'` و`amount=0` | `redeem_reward` |

`checkout` يُدرج `CONFIRMED` مباشرة لأن الدفع النقدي يقع بيد الباريستا لحظياً.
تدفّق البطاقة المستقبلي يُدرج `PENDING` ثم يؤكّد.

### 9.2 الوردية

```
   (فتح بفكّة) ──► OPEN ──(عدّ أعمى)──► CLOSED  (نهائية)
                    │
                    ├── SALE / DROP / REMOVAL / REFUND / EXPENSE  → cash_movements
                    └── تسليم درج (اختياري) → drawer_handovers
```

- وردية مفتوحة **واحدة** لكل فرع (فهرس فريد جزئي).
- الإغلاق يمرّ حصراً عبر `close_shift_blind(shift, user, counted)`:
  يكتب المعدود، **ثم** يحسب المتوقّع والفرق ويخزّنهما، ويُرجع `{"closed": true}` — بلا أرقام.
- وردية بلا عدّ تبقى `OPEN` (استثناء يظهر في لوحة المالك).

### 9.3 اليوم

```
   كل ورديات الفرع CLOSED ──► day_closes(branch, business_day) ──► اليوم مقفول
                                                                        │
                              day.reopen + khazaf.reopen='on' ◄─────────┘
```

بعد الإغلاق يرفض مُشغّل `orders_day_closed` أي طلب جديد في ذلك اليوم لذلك الفرع.
إعادة الفتح تحتاج `day.reopen` وتُسجَّل في `audit_log`.

### 9.4 القفل الطارئ

`branches.pos_locked = true` ⇒ `checkout` يرفض أي بيع جديد **في القاعدة**
(«الكاشير مقفول — راجع المالك»). الطلب الجاري يُكمَّل. الفتح للمالك وحده،
ويُسجَّل. **يدوي فقط — لا قفل تلقائي على أي فرق.**

---

## 10. آلة حالة الولاء

### 10.1 العميل (تسجيل ذاتي — §37)

```
   موقع خزف / QR في المحل
        └─► إدخال رقم الهاتف
              └─► otp_codes (code_hash · expires_at · attempts)
                    └─► تحقّق ناجح → customers.phone_verified_at = now()
                          └─► loyalty_accounts (ACTIVE)
```

**الباريستا خارج هذا المسار كلّياً** (§38): لا ينشئ حساباً، ولا يعدّل رصيداً،
ولا يقرأ `otp_codes`. كل ما يملكه: البحث برقم الهاتف وقراءة `v_loyalty_accounts`.

### 10.2 الأختام (§39 · §46)

```
   بيع مكتمل عليه عميل
        └─► EARN  (+ عدد المشروبات المؤهّلة، بسقف max_stamps_per_order)
              └─► كلّما بلغ الرصيد stamps_per_reward:
                    REWARD_ISSUED (−5)  +  loyalty_rewards(AVAILABLE)
```

**لا يكسب** (§40): مكافأة · مشروب موظف · هدر · ملغى · مُرجَع · مجاني ·
منتج `loyalty_eligible = false`.

الكسب يقع **داخل معاملة البيع نفسها** عبر مُشغّل مؤجَّل إلى لحظة الـCommit
(`deferrable initially deferred`) — لأن بنود الطلب تُدرَج بعد صفّ الطلب، فلو
نُفِّذ فور الإدراج لوجد الفاتورة فارغة.

### 10.3 المكافأة (§41 · §42 · §45)

```
   AVAILABLE ──(redeem_reward)──► REDEEMED   (نهائية)
        ├──────────────────────► CANCELLED  (نهائية — انعكاس إرجاع)
        └──────────────────────► EXPIRED    (نهائية)
```

- **لا إنشاء يدوي**: المكافأة تُصدَر تلقائياً عند اكتمال العتبة، لا بزرّ.
- **لا صرف مرّتين**: `unique(redeemed_order_id)` + مُشغّل يرفض أي انتقال من غير `AVAILABLE`.
- الصرف يُنشئ **طلباً مستقلّاً**: `order_type='LOYALTY_REWARD'` ·
  `subtotal = السعر الكامل` · `discount = السعر الكامل` · `total = 0` ·
  `payments.method='loyalty'` بمبلغ 0 · **لا حركة كاش ولا فتح درج** (§43) ·
  المخزون ينقص بنوع `LOYALTY_REWARD` (§43).

### 10.4 الإرجاع وأثره (§47)

```
   الطلب → REFUNDED / VOIDED / CANCELLED
        └─► EARN_REVERSAL (− ما كسبه ذلك الطلب)
              └─► إن بقيت مكافأة AVAILABLE والرصيد سالب → CANCELLED
```

**لا يُعدَّل التاريخ**: العكس حركة جديدة، والحركات القديمة تبقى.

> **حالة مقصودة:** لو صُرفت المكافأة **قبل** الإرجاع فلا يمكن سحبها من الزبون،
> فيبقى الرصيد سالباً ويُخصم من كسبه القادم. الدفتر يحتفظ بالحقيقة (`stamps`)،
> وشاشة الباريستا تعرض `stamps_display = max(stamps, 0)` حتى لا يرى الزبون رقماً
> سالباً محيّراً. المالك يرى الرقم الحقيقي.

---

## 11. قواعد دفتر المخزون

### 11.1 القاعدة الأولى

> **الرصيد = Σ(inventory_transactions.qty_delta).**
> `materials.cached_stock` تسريع فقط، وكاتبه **الوحيد** مُشغّل الدفتر.

مفروضة بمُشغّلين:

| المُشغّل | ما يفعله |
|---|---|
| `inv_txn_apply_stock` (AFTER INSERT) | يطبّق `qty_delta` على `cached_stock` — الكاتب الوحيد |
| `materials_guard` (BEFORE UPDATE) | يرفض أي تعديل لـ`cached_stock` لا يأتي من المُشغّل، ويرفض السالب غير المسموح |
| `inv_txn_append_only` (BEFORE UPDATE/DELETE) | يرفض تعديل أو حذف أي حركة |

محاولة `update materials set cached_stock = …` من أي كود ترفع:
> «الرصيد يُشتقّ من الدفتر — أدرج حركة في inventory_transactions بدل تعديل cached_stock (§12)»

### 11.2 أنواع الحركة ومن يكتبها

| النوع | الإشارة | الكاتب | يُحتسب استهلاكاً نظرياً |
|---|:--:|---|:--:|
| `PURCHASE` | + | `record_purchase` | لا |
| `SALE` | − | `checkout` | نعم |
| `LOYALTY_REWARD` | − | `redeem_reward` | نعم |
| `STAFF` (=STAFF_DRINK) | − | `staff_drink` | نعم |
| `WASTE` | − | `record_waste` | نعم |
| `ADJUSTMENT` (=COUNT_ADJUSTMENT) | ± | `apply_stock_count` | لا (تصحيح) |
| `TRANSFER_IN` / `TRANSFER_OUT` | ± | نقل بين الفروع (V2) | لا |
| `OTHER_APPROVED` | ± | استثناء بموافقة المالك | لا |

### 11.3 متوسط التكلفة المرجّح

عند الشراء:
```
current_cost = round( (المخزون_السابق × التكلفة_السابقة + الكمية × سعر_الوحدة)
                      ÷ (المخزون_السابق + الكمية) )
```
عدد صحيح. الشراء **لا يغيّر** الرصيد بنفسه — الحركة تفعل.

### 11.4 الجرد (§36)

وثيقة `stock_counts` + بنود `stock_count_items` (المتوقّع · المعدود · الفرق · الفرق٪)
ثم **حركة `ADJUSTMENT` واحدة بمقدار الفرق** تجعل الرصيد = المعدود.
لا تُعدَّل حركة قديمة، ولا يُكتب الرصيد مباشرة.

### 11.5 الفرق غير المُفسَّر (§32–§35 · §57)

```
الاستهلاك النظري = بيع + مكافآت + مشروبات موظفين + هدر مسجَّل
الفرق            = المعدود − المتوقّع
الفرق٪           = (الفرق ÷ المتوقّع) × 100
مكافئ الجرعات    = |الفرق| ÷ materials.dose_grams
```

**ثلاث قواعد لا تُكسَر:**

1. **النسبة عتبة تنبيه، لا كمية هدر مسموحة.** ٣٪ لا تعني أن ٣٪ «مقبولة».
2. **الفرق لا يُكتب أبداً كـ`WASTE`.** يُسمّى `unexplained_variance` ويبقى فرقاً.
3. **لا يُسمّى «سرقة»** (§57). النظام يكتشف الفرق ولا يعرف سببه.

مثال حقيقي من الاختبار: استهلاك متوقّع 4788غ، معدود 4770غ، فرق **−18غ** =
**−0.38٪** — تحت عتبة ٣٪ — لكنه **جرعة دبل كاملة (1.00)**. لهذا يظهر في لوحة
الاستثناءات رغم صغر النسبة: بدون مكافئ الجرعات يختبئ كوب كامل داخل نسبة صغيرة
كلّما ارتفعت المبيعات (§34).

**كشف النمط (§35):** `v_repeated_variance` يرصد المادة التي تكرّر نقصها ≥ ٣ مرّات
خلال ٣٠ يوماً. النقص المتكرّر بمقدار جرعة أخطر من نقص كبير مرّة واحدة.

---

## 12. صيغ حساب الكاش

### 12.1 القاعدة الأم (§23)

```
النقد المتوقّع في الدرج = الفكّة الافتتاحية
                        + Σ(cash_movements.amount ما عدا OPENING)
```

بالتفصيل، وكل الحركات بإشارتها المخزّنة:

```
expected_cash = opening_float
              + Σ(SALE)        ← موجب: البيع النقدي فقط (البطاقة لا تدخل الدرج)
              − Σ(REFUND)      ← سالب
              − Σ(EXPENSE)     ← سالب
              − Σ(DROP)        ← سالب  (§24 سحب أثناء اليوم)
              − Σ(REMOVAL)     ← سالب  (§25 سحب مبيعات الإغلاق)
```

مطبَّقة في دالة واحدة `shift_expected_cash(shift_id)` — **لا يعاد الحساب في
مكان آخر**، حتى لا تختلف نسختان.

### 12.2 ما ليس إيراداً

| البند | لماذا |
|---|---|
| `opening_float` | فكّة، لا بيع (§23). درج بدأ بـ50,000 وباع 300,000 ⇒ المتوقّع 350,000 لكن **الإيراد 300,000**. |
| `DROP` | نقل مال، لا بيع (§24) |
| `REMOVAL` | نقل مال، لا بيع (§25) |
| `NO_SALE` | ليس حركة نقدية أصلاً — جدول مستقلّ بلا مبلغ (§28) |
| مبيعات البطاقة | لا تدخل الدرج |
| مكافأة الولاء | إيرادها 0 ولا تفتح الدرج (§43) |
| مشروب الموظف | إيراده 0 ولا يفتح الدرج (§30) |

### 12.3 الفرق (§26)

```
variance = counted_cash − expected_cash        (سالب = نقص)
```

**العدّ أعمى:** الباريستا يُدخل `counted_cash` قبل أن يحسب النظام المتوقّع،
ولا يرى `expected_cash` ولا `variance` — يحتاج `cash.view_expected` وهي للمالك.

### 12.4 سحب مبيعات الإغلاق (§25)

```
cash_removal(shift, user, keep_float, reason):
    amount = shift_expected_cash(shift) − keep_float
    شرط: amount > 0
    → cash_movements(REMOVAL, −amount)
    → audit_log(cash_removal)
```
مثال: متوقّع 350,000 · تُترك فكّة 50,000 ⇒ سحب 300,000 ويبقى 50,000 للغد.

### 12.5 لمحة اليوم (§54)

`day_summary(branch, day)` يرجع jsonb: `orders` · `paid_orders` · `loyalty_orders` ·
`staff_orders` · `voided` · `refunded` · `cash_sales` · `card_sales` · `discounts` ·
`refunds_total` · `expected_cash` · `actual_cash` · `cash_variance` · `closed`.

**للمالك فقط** — خلف `reports.financial`.

---

## 13. نقاط النهاية / Server Actions

النظام Next.js App Router: لا REST API عام، بل **Server Actions**. كل واحدة
تبدأ بـ`requirePermission(...)`، وتُنادى بطلب مباشر إن أراد أحد ذلك — لذلك
الفحص خادميّ لا شكليّ.

### 13.1 القائمة

| المسار / الدالة | الصلاحية | يستدعي في القاعدة | ذرّية |
|---|---|---|:--:|
| `login/actions.ts → signIn(pin)` | — | تحقّق bcrypt + عدّاد محاولات | |
| `signOut()` | مُصادَق | `audit_log` | |
| **البيع** | | | |
| `pos/actions.ts → checkoutAction(cart, method, tendered, idem, customer?, discount?)` | `orders.create` + `payments.create` | `checkout(...)` | ✅ |
| `pos/orders-actions.ts → myOrders()` | `orders.view_own` | استعلام مقيَّد بالموظف والوردية | |
| `reprintReceipt(orderId)` | `orders.reprint` | قراءة الطلب — **لا إنشاء جديد** (§21) | |
| `voidPaidOrder(orderId, reason, approvedBy)` | `payments.void` | `order_voids` + حالة الطلب | ✅ |
| `refundOrder(orderId, items, amount, reason, idem)` | `payments.refund` | `refunds` + `refund_items` | ✅ |
| `applyDiscount(orderId, kind, value, reason)` | `discounts.apply` | `order_discounts` | ✅ |
| **الورديات والكاش** | | | |
| `pos/shift-actions.ts → openShift(float)` | `cash.open_shift` | إدراج `shifts` | |
| `closeShift(counted)` | `cash.close_shift` + `cash.count` | `close_shift_blind(...)` | ✅ |
| `cashDrop(amount, reason)` | `cash.drop` | `cash_movements(DROP)` | |
| `cashRemoval(keepFloat, reason)` | `cash.remove` | `cash_removal(...)` | ✅ |
| `noSaleOpen(reason)` | `cash.no_sale_open` | `no_sale_opens` | |
| `handoverDrawer(toUser, counted)` / `confirmHandover(id)` | `cash.handover` | `drawer_handovers` | |
| **المخزون** | | | |
| `pos/waste-actions.ts → recordWaste(material, qty, reason)` | `inventory.waste` | `record_waste(...)` | ✅ |
| `pos/staff-actions.ts → staffDrink(product, crop, fulfillment)` | `staff_drinks.create` | `staff_drink(...)` | ✅ |
| `manage/actions.ts → addStock(material, qty, cost)` | `inventory.receive` | `record_purchase(...)` | ✅ |
| `applyCount(counts)` | `inventory.count` | `apply_stock_count(...)` | ✅ |
| **الولاء** | | | |
| `loyalty/actions.ts → findCustomer(phone)` | `loyalty.view_customer` | `v_loyalty_accounts` — أختام ومكافآت فقط | |
| `redeemReward(rewardId, product, crop, idem)` | `loyalty.redeem` | `redeem_reward(...)` | ✅ |
| `api/loyalty/signup` (عام، بحدّ معدّل) | — | `otp_codes` + `customers` + `loyalty_accounts` | ✅ |
| **الإدارة** | | | |
| `manage/products-actions.ts → upsertProduct/Crop/Recipe` | `products.manage` · `prices.manage` · `recipes.manage` | + `price_history` تلقائياً | |
| `manage/settings-actions.ts → saveSetting(key, value)` | `settings.manage` | `settings` + تفريغ كاش الصلاحيات | |
| `manage/day-actions.ts → closeDay()` | `day.close` | `day_closes` + `day_summary` | ✅ |
| `reopenDay(day, reason)` | `day.reopen` | `khazaf.reopen='on'` + `audit_log` | ✅ |
| `manage/lock-actions.ts → setPosLock(locked)` | `pos.lock` | `branches.pos_locked` + `audit_log` | |
| **التقارير** | | | |
| `reports → today()` | `reports.financial` | `day_summary(...)` | |
| `inventoryReport(from, to)` | `inventory.view` | `inventory_dashboard(...)` | |
| `exceptions()` | `reports.view` | `v_exceptions` | |
| `auditTrail(filters)` | `audit.view` | `audit_log` | |

### 13.2 قاعدة عامة

كل عملية تكتب مالاً أو مخزوناً **تنادي دالة قاعدة واحدة** تفعل كل شيء في معاملة
واحدة. لا يوزّع الخادم العملية على عدّة استعلامات — لأن انقطاع الشبكة بينها
يترك حالة نصفية.

---

## 14. قواعد التحقّق

### 14.1 المستويات

| المستوى | مثال | لماذا هنا |
|---|---|---|
| الواجهة | تعطيل زرّ الدفع والسلة فارغة | راحة فقط |
| الخادم | الصلاحية · سبب الهدر من قائمة · حدّ مشروبات الوردية | يحتاج سياقاً (جلسة، إعدادات) |
| **القاعدة** | كل ما يلي | يصمد لو أُخطئ فوقه |

### 14.2 قيود القاعدة

| القاعدة | التطبيق |
|---|---|
| المال والكميات أعداد صحيحة | نوع `integer` في كل عمود مالي/كمّي |
| `subtotal`,`discount`,`total`,`payments.amount`,`tendered`,`change`,`price`,`unit_price`,`current_cost`,`low_threshold`,`standard_float`,`opening_float`,`counted_cash` ≥ 0 | `CHECK` |
| `order_items.qty` > 0 · `recipe_items.qty` > 0 · `refunds.amount` > 0 · `refund_items.qty` > 0 | `CHECK` |
| خصم بنسبة بين 0 و100 | `CHECK` |
| حساب الخصم صحيح: `final_total = original_total − amount` | `CHECK` |
| طلب مكافأة إجماليه 0 | `CHECK` |
| إشارة حركة الكاش تطابق نوعها | `CHECK` |
| تسليم الدرج بين شخصين مختلفين | `CHECK` |
| العميل له رقم هاتف | `CHECK` |
| **الإرجاع ≤ المدفوع** | مُشغّل `refunds_cap` |
| **لا مخزون سالب** (إلا `allow_negative`) | مُشغّل `materials_guard` |
| **الرصيد لا يُكتب مباشرة** | مُشغّل `materials_guard` |
| **الدفتر وسجلّ التدقيق ودفتر الولاء وحركات الكاش: للإلحاق فقط** | مُشغّل `khazaf_append_only` |
| **لا حذف/تعديل دفعة** | مُشغّل `payments_guard` |
| انتقالات الطلب والدفع والمكافأة والتسليم | مُشغّلات آلات الحالة |
| **لا عملية في يوم مُغلق** | مُشغّل `orders_day_closed` |
| القفل الطارئ يمنع البيع | داخل `checkout` |

### 14.3 تحقّقات داخل دوال البيع

| التحقّق | الخطأ |
|---|---|
| نوع التقديم من `takeaway`/`dine_in` | «نوع تقديم غير صالح» |
| طريقة الدفع من `cash`/`card` | «طريقة دفع غير صالحة» |
| السلة غير فارغة | «الطلب فارغ» |
| المشروب فعّال وغير موقوف | «مشروب غير متاح» |
| المحصول متاح لهذا المشروب | «محصول غير متاح لهذا المشروب» |
| وصفة فعّالة موجودة | «لا توجد وصفة فعّالة» |
| الخيار ينتمي لمجموعة هذا المشروب ومتاح | «خيار غير متاح» |
| الكمية > 0 | «كمية غير صالحة» |
| **المخزون يكفي بعد قفل الصفوف** | «المخزون لا يكفي لإتمام الطلب» |
| **المدفوع ≥ الإجمالي** (كاش) | «المبلغ المدفوع أقل من الإجمالي» |
| الخصم له سبب | «الخصم يحتاج سبباً (§48)» |
| الفرع مهيَّأ بعدّاد | «الفرع غير مهيّأ (order_counters)» |
| الكاشير غير مقفول | «الكاشير مقفول — راجع المالك» |

### 14.4 قواعد لا يفرضها إلا الخادم

| القاعدة | أين |
|---|---|
| سبب الهدر من القائمة الثابتة (§29) | `waste-actions.ts` |
| حدّ مشروبات الموظف للوردية، والزيادة بموافقة (§30) | `staff-actions.ts` + `approvals.ts` |
| **الباريستا لا يُدخل كمية الوصفة** (§31) | الوصفة تُقرأ من القاعدة؛ لا معامل كمية في أي دالة بيع |
| حدّ محاولات PIN (5 ثم قفل 5 دقائق) | `auth.ts` + `users.failed_pin_attempts` |
| سقف الخصم قبل طلب موافقة | `discounts.apply` مقابل `discounts.apply_sensitive` |
| حدّ معدّل طلبات OTP | `api/loyalty/signup` |

---

## 15. حدود المعاملات

### 15.1 القاعدة

> كل عملية تمسّ المال أو المخزون = **معاملة واحدة**. إمّا كلّها أو لا شيء.
> لا يوجد «الفلوس انحسبت والمخزون ما نقص» (§13).

### 15.2 البيع — `checkout()` (§59)

```
BEGIN
 1. فحص idempotency_key       → موجود؟ أرجع النتيجة السابقة واخرج (بلا أثر ثانٍ)
 2. فحص القفل الطارئ
 3. لكل بند: تحقّق المنتج والمحصول والوصفة · اقرأ السعر من القاعدة · طبّق الخيارات
 4. اجمع احتياج كل مادة
 5. SELECT … FOR UPDATE على صفوف المواد (مرتّبة بالمعرّف ← لا Deadlock)
 6. أعد التحقّق أن الرصيد يكفي        ← يمنع البيع المزدوج والسالب
 7. احسب الخصم والإجمالي والباقي
 8. قدّم عدّاد الفرع → رقم الفاتورة   ← بعد كل التحقّقات ← بلا فجوات
 9. INSERT orders (COMPLETED, SALE)
10. INSERT order_items (+ لقطة الوصفة) و order_item_modifiers
11. INSERT order_discounts        (إن وُجد خصم)
12. INSERT payments (CONFIRMED, idempotency_key)
13. INSERT inventory_transactions (SALE −) → المُشغّل ينقص cached_stock
14. INSERT cash_movements (SALE +)        (كاش فقط)
15. [عند الـCommit] مُشغّل الولاء المؤجَّل → EARN + إصدار مكافأة إن اكتملت العتبة
COMMIT
```
أي فشل ⇒ **Rollback كامل**: لا طلب، لا دفع، لا خصم مخزون، ولا حتى تقدّم في
رقم الفاتورة.

### 15.3 بقية المعاملات

| العملية | الدالة | ما يقع معاً |
|---|---|---|
| مكافأة ولاء | `redeem_reward` | قفل المكافأة · قفل المواد · طلب · بند · خصم موثّق · دفع 0 · دفتر مخزون · إغلاق المكافأة · دفتر ولاء · تدقيق |
| مشروب موظف | `staff_drink` | قفل المواد · طلب بإجمالي 0 · بند · دفتر مخزون · تدقيق |
| شراء | `record_purchase` | قفل المادة · حركة `PURCHASE` · تحديث التكلفة المرجّحة |
| هدر | `record_waste` | قفل المادة · فحص الكفاية · حركة `WASTE` |
| جرد | `apply_stock_count` | وثيقة العدّ · بنودها · حركة `ADJUSTMENT` لكل فرق |
| إغلاق وردية | `close_shift_blind` | قفل الوردية · حساب المتوقّع · تخزين المعدود والفرق · تدقيق |
| سحب مبيعات | `cash_removal` | حساب المبلغ · حركة `REMOVAL` · تدقيق |
| إرجاع | `refunds` + مُشغّلاته | فحص السقف · تحديث حالة الطلب · حركة كاش سالبة · عكس الولاء |

### 15.4 منع التسابق

| الخطر | الحماية |
|---|---|
| بيعان متزامنان لآخر كمية | `FOR UPDATE` على صفوف المواد + إعادة تحقّق بعد القفل |
| Deadlock بين طلبين | قفل الصفوف **مرتّباً بـ`material_id`** دائماً |
| رقمان متطابقان للفاتورة | `UPDATE order_counters … RETURNING` يقفل الصفّ + `unique(branch_id, order_number)` |
| ورديتان مفتوحتان | فهرس فريد جزئي |
| صرف المكافأة مرّتين | `FOR UPDATE` على المكافأة + `unique(redeemed_order_id)` + مُشغّل الحالة |
| إرجاع يتجاوز المدفوع بالتوازي | مُشغّل يعيد الحساب من الجدول عند كل إدراج |

---

## 16. منع التكرار (Idempotency)

### 16.1 لماذا

نقرة مزدوجة · إعادة إرسال بعد انقطاع · تحديث الصفحة · مهلة انتهت والطلب نجح
فعلاً. بلا حماية = دفع مزدوج وخصم مخزون مزدوج (§60 · §61).

### 16.2 آلية واحدة

| العملية | المفتاح | يخزَّن في |
|---|---|---|
| البيع | `idem` يولّده المتصفح مرّة لكل محاولة سلّة | `payments.idempotency_key` **unique** |
| صرف مكافأة | نفس النمط | `payments.idempotency_key` |
| الإرجاع | `refund:<order>:<n>` | `refunds.idempotency_key` **unique** |
| كسب ولاء | `earn:<order_id>` | `loyalty_ledger.idempotency_key` **unique** |
| إصدار مكافأة | `issue:<reward_id>` | `loyalty_ledger.idempotency_key` |
| صرف مكافأة (دفتر) | `redeem:<reward_id>` | `loyalty_ledger.idempotency_key` |
| عكس كسب | `reversal:<order_id>` | `loyalty_ledger.idempotency_key` |
| حركة مخزون خارجية | اختياري | `inventory_transactions.idempotency_key` **unique** |
| مصالحة الهجرة | `reconcile-0011:<material_id>` | `inventory_transactions.idempotency_key` |

### 16.3 السلوك

```
إعادة إرسال بنفس المفتاح ⇒ لا عملية جديدة، بل نفس النتيجة + "replay": true
```

المفتاح يُولَّد **مرّة واحدة لكل سلّة** ويبقى ثابتاً عبر إعادة المحاولة. تغييره
عند كل ضغطة يبطل الحماية كلّها.

### 16.4 انقطاع الشبكة (§61)

- انقطاع **قبل** الـCommit ⇒ لا شيء حدث. رسالة «انقطع الاتصال — أعد المحاولة».
- انقطاع **بعد** الـCommit وقبل وصول الردّ ⇒ إعادة المحاولة بنفس المفتاح تُرجع
  الفاتورة الأصلية.
- **لا يُعتبر الدفع مكتملاً إلا بردّ مؤكَّد من القاعدة.** لا «بيع متفائل».
- لا وضع Offline في V1 (§64): انقطاع الإنترنت يوقف البيع مؤقّتاً ولا يخترع بيعاً وهمياً.

---

## 17. أحداث التدقيق

### 17.1 الجدول

`audit_log` **للإلحاق فقط**: لا `UPDATE` ولا `DELETE` لأي مستخدم — مفروض
بمُشغّل في القاعدة، لا بصلاحية يمكن منحها.

كل صفّ: `user_id` (الفاعل) · `approved_by` (من وافق) · `action` · `entity_type` ·
`entity_id` · `before` · `after` · `reason` · `created_at` (وقت الخادم) ·
`business_id` · `branch_id`.

### 17.2 الأحداث

| المجموعة | `action` |
|---|---|
| **الدخول** | `login` · `logout` · `login_failed` · `login_locked` |
| **الطلبات** | `order_voided` · `refund_created` · `refund_approved` · `discount_applied` · `complimentary_order` |
| **الكاش** | `open_shift` · `close_shift` (مع الفرق) · `cash_drop` · `cash_removal` · `no_sale_open` · `drawer_handover` |
| **المخزون** | `waste_recorded` · `stock_received` · `stock_count` · `inventory_adjustment` |
| **الكتالوج** | `price_changed` · `recipe_changed` · `product_changed` |
| **الولاء** | `loyalty_reward_redeemed` · `loyalty_adjustment` · `loyalty_account_blocked` |
| **الموظفون** | `user_created` · `user_disabled` · `pin_changed` · `permission_changed` |
| **النظام** | `settings_changed` · `pos_lock` · `pos_unlock` · `day_close` · `day_reopen` |
| **الأمن** | `unauthorized_attempt` (طلب بلا صلاحية — إشارة تلاعب) |

### 17.3 قاعدة

كل ما يحتاج `sensitive = true` في كتالوج الصلاحيات **يجب** أن يكتب صفّ تدقيق.
عملية حسّاسة بلا أثر في السجلّ = ثغرة، لا تبسيط.

---

## 18. معالجة الأخطاء

### 18.1 التصنيف

| الصنف | مثال | ما يراه الباريستا | HTTP |
|---|---|---|---|
| **تحقّق** | سلّة فارغة · مبلغ أقلّ | نصّ الخطأ العربي كما هو | 400 |
| **مخزون** | «المخزون لا يكفي» | الرسالة + المشروب المتعذّر | 409 |
| **صلاحية** | بلا `payments.refund` | «لا تملك صلاحية هذه العملية» + `audit_log(unauthorized_attempt)` | **403** |
| **مصادقة** | جلسة منتهية | تحويل إلى `/login` | 401 |
| **تعارض** | مفتاح مكرّر | النتيجة السابقة (`replay`) — **ليس خطأً** | 200 |
| **قفل** | الكاشير مقفول · اليوم مُغلق | «الكاشير مقفول — راجع المالك» | 423 |
| **شبكة/قاعدة** | انقطاع | «انقطع الاتصال — أعد المحاولة» + نفس المفتاح | 503 |
| **داخلي** | خلل غير متوقّع | «حدث خطأ — أعد المحاولة» + تسجيل خادمي | 500 |

### 18.2 قواعد

1. **لا يُسرَّب رقم مالي في خطأ يراه الباريستا.** «المخزون لا يكفي» ✓ ·
   «المتوقّع 350,000 والمعدود 337,000» ✗.
2. **الخطأ لا يترك حالة نصفية** — كل شيء داخل معاملة.
3. **الرسالة تقول ما العمل**، لا ما انكسر.
4. **403 يُسجَّل دائماً**: محاولة غير مصرّح بها إشارة تلاعب، لا مجرّد خطأ.
5. **رموز الأخطاء من القاعدة تُترجَم، لا تُعرَض خاماً**: `restrict_violation` ·
   `check_violation` · `unique_violation` لها رسائل عربية جاهزة.
6. **لا تفاصيل داخلية للمستخدم**: أسماء جداول وأعمدة وSQL تُسجَّل خادمياً فقط.

---

## 19. حالات الاختبار

### 19.1 ما نُفِّذ فعلاً

طُبِّقت الهجرات `0009`–`0016` على نسخة مطابقة للمخطّط الحيّ (PostgreSQL،
٢٨ جدولاً + البذور) وشُغِّلت الحالات التالية. **كلها تمرّ.**

#### أ) البيع والذرّية

| # | الحالة | المتوقّع | النتيجة |
|---|---|---|:--:|
| 1 | بيع ٢ لاتيه، كاش 10,000 | فاتورة 1001 · إجمالي 6,000 · باقٍ 4,000 | ✅ |
| 2 | خصم المواد | حبوب −36غ · حليب −360مل · كوب/غطاء −2 | ✅ |
| 3 | **الرصيد = Σ الدفتر لكل مادة** | تطابق تامّ (لا خصم مزدوج بعد نقل الكتابة للمُشغّل) | ✅ |
| 4 | إعادة إرسال بنفس `idempotency_key` | `replay=true` · طلب واحد · مخزون بلا تغيير | ✅ |
| 5 | `dine_in` | لا يخصم الكوب والغطاء | ✅ |
| 6 | نوع الطلب | `SALE` | ✅ |

#### ب) التكامل — ما يجب أن يُرفَض

| # | المحاولة | النتيجة |
|---|---|:--:|
| 7 | `UPDATE inventory_transactions` | ✅ مرفوضة |
| 8 | `DELETE FROM inventory_transactions` | ✅ مرفوضة |
| 9 | `UPDATE audit_log` | ✅ مرفوضة |
| 10 | `DELETE FROM audit_log` | ✅ مرفوضة |
| 11 | `UPDATE materials SET cached_stock = …` مباشرة | ✅ مرفوضة |
| 12 | حركة تُنزل الرصيد تحت الصفر | ✅ مرفوضة |
| 13 | `DELETE FROM payments` | ✅ مرفوضة |
| 14 | تعديل مبلغ دفعة | ✅ مرفوضة |
| 15 | `CONFIRMED → FAILED` | ✅ مرفوضة |
| 16 | `COMPLETED → DRAFT` · `COMPLETED → PAID` | ✅ مرفوضة |
| 17 | `DROP` بإشارة موجبة | ✅ مرفوضة |
| 18 | `UPDATE cash_movements` | ✅ مرفوضة |
| 19 | `COMPLETED → VOIDED` | ✅ **مسموحة** |

#### ج) الولاء

| # | الحالة | المتوقّع | النتيجة |
|---|---|---|:--:|
| 20 | ٣ فواتير × ٢ لاتيه لعميل | ٣ حركات `EARN` بـ+2 | ✅ |
| 21 | بلوغ العتبة (5) | `REWARD_ISSUED −5` + مكافأة `AVAILABLE` تلقائياً · الرصيد 1 | ✅ |
| 22 | صرف المكافأة | فاتورة 1004 · `LOYALTY_REWARD` · subtotal 3,000 · discount 3,000 · **total 0** · `method=loyalty` | ✅ |
| 23 | أثر الصرف على الكاش | **صفر حركات** (§43) | ✅ |
| 24 | أثر الصرف على المخزون | حبوب −18 · حليب −180 · كوب −1 · غطاء −1 بنوع `LOYALTY_REWARD` | ✅ |
| 25 | إعادة صرف نفس المكافأة | ✅ مرفوضة: «المكافأة غير متاحة (REDEEMED)» | ✅ |
| 26 | إرجاع فاتورة كسبت أختاماً | `EARN_REVERSAL −2` · الطلب `REFUNDED` · حركة كاش `−6,000` | ✅ |
| 27 | إرجاع 999,999 على فاتورة 6,000 | ✅ مرفوض: «الإرجاع يتجاوز المدفوع» | ✅ |

#### د) الكاش والوردية واليوم

| # | الحالة | المتوقّع | النتيجة |
|---|---|---|:--:|
| 28 | فتح درج بلا بيع | حدث مسجَّل بموظف وسبب | ✅ |
| 29 | سحب مبيعات (`keep_float=50,000`) | سُحب 12,000 · المتوقّع بعده 50,000 | ✅ |
| 30 | تسليم الدرج وتأكيده | `drawer_owner_id` انتقل للمُستلِم | ✅ |
| 31 | تعديل تسليم مُنجَز | ✅ مرفوض | ✅ |
| 32 | **الإغلاق الأعمى** | معدود 49,500 · متوقّع 50,000 · فرق **−500** · المُعاد للباريستا `{"closed": true}` بلا أرقام | ✅ |
| 33 | بيع بعد إغلاق اليوم | ✅ مرفوض | ✅ |
| 34 | بيع بعد إعادة فتح اليوم (`day.reopen`) | ✅ نجح (فاتورة 1005) | ✅ |
| 35 | `day_summary` | 5 طلبات · 3 مدفوعة · 1 ولاء · 1 مُرجَع · كاش 21,000 · متوقّع 50,000 · فعلي 49,500 · فرق −500 | ✅ |

#### هـ) المخزون والفروقات

| # | الحالة | المتوقّع | النتيجة |
|---|---|---|:--:|
| 36 | مشروب موظف | فاتورة 1006 · `STAFF_DRINK` · total 0 · **صفر حركات كاش** · مخزون بنوع `STAFF` | ✅ |
| 37 | هدر بلا سبب | ✅ مرفوض: «الهدر يحتاج سبباً» | ✅ |
| 38 | جرد بفرق −18غ | وثيقة عدّ + `ADJUSTMENT −18` · الرصيد = المعدود | ✅ |
| 39 | **الرصيد = Σ الدفتر للمواد التسع** بعد بيع ومكافأة ومشروب موظف وهدر وجرد | تطابق تامّ | ✅ |
| 40 | **§34 مكافئ الجرعات** | فرق −18غ = **−0.38٪** (تحت عتبة ٣٪) لكن **1.00 جرعة** · `level=within_threshold` · `label=unexplained_variance` | ✅ |
| 41 | `inventory_dashboard` | افتتاحي/مشتريات/بيع/ولاء/موظفين/هدر/تسويات/متوقّع/فعلي/فرق — والفرق صفر بعد الجرد | ✅ |
| 42 | `v_exceptions` | ٤ استثناءات: إرجاع (high) · فرق درج · فرق مخزون · فتح درج بلا بيع | ✅ |

#### و) الأسعار والمصالحة

| # | الحالة | المتوقّع | النتيجة |
|---|---|---|:--:|
| 43 | رفع سعر اللاتيه 3,000 → 3,500 | صفّ في `price_history` بالقديم والجديد والفاعل والسبب | ✅ |
| 44 | **الطلبات القديمة بعد تغيير السعر** | لقطة السعر 3,000 بينما السعر الحالي 3,500 (§8) | ✅ |
| 45 | **مصالحة انحراف حقيقي** (985مل رصيد بلا دفتر على القاعدة الحيّة) | حركة `ADJUSTMENT +985` تفسّره · الانحراف 0 · المخزون الفعلي لم يُمسّ | ✅ |
| 46 | إعادة تطبيق الهجرات كلّها | لا ازدواج ولا خطأ (idempotent) | ✅ |

#### ز) اختبارات الوحدة (`npm test`)

11 اختباراً تمرّ: تنسيق الدينار بأرقام إنجليزية بلا كسور · تحويل الوحدات
(كغ↔غ، لتر↔مل) · التكلفة لكل وحدة أساس. و`npm run typecheck` يمرّ.

### 19.2 ما يجب أن يُختبر عند بناء الواجهات الجديدة

| # | الحالة | المتوقّع |
|---|---|---|
| 47 | بيعان متزامنان لآخر 18غ | واحد ينجح والآخر يُرفَض — **لا رصيد سالب** |
| 48 | نقرة مزدوجة على «دفع» | فاتورة واحدة |
| 49 | فشل الطابعة بعد الدفع | «إعادة طباعة» تعيد **نفس** الفاتورة، لا طلباً جديداً (§21) |
| 50 | إرجاع جزئي ثم آخر يتجاوز المتبقّي | الأول ينجح (`PARTIALLY_REFUNDED`) والثاني يُرفَض |
| 51 | تسجيل عميل: رمز منتهٍ · رمز خاطئ ٥ مرّات | رفض وحدّ معدّل |
| 52 | مشروب موظف يتجاوز حدّ الوردية | يحتاج موافقة، وتُسجَّل في `approved_by` |
| 53 | فرق درج متكرّر لنفس الموظف ٣ أيام | يظهر في لوحة الاستثناءات |

---

## 20. اختبارات الأمن

> كل حالة هنا تُنفَّذ **بطلب مباشر إلى الخادم**، لا بالنقر في الواجهة. إخفاء
> الزرّ ليس اختباراً (§66).

### 20.1 التخويل

| # | الحالة | المتوقّع |
|---|---|---|
| S1 | باريستا يستدعي `refundOrder` مباشرة | **403** + `audit_log(unauthorized_attempt)` |
| S2 | باريستا يستدعي `voidPaidOrder` | 403 |
| S3 | باريستا يستدعي `cashDrop` / `cashRemoval` | 403 |
| S4 | باريستا يطلب `day_summary` أو أي تقرير مالي | 403 — **لا يرى إجمالياً أبداً** |
| S5 | باريستا يقرأ `expected_cash` أو `variance` لوردية | 403 (`cash.view_expected`) — **عماء العدّ** |
| S6 | باريستا يستدعي `addStock` / `applyCount` / تسوية | 403 |
| S7 | باريستا يستدعي `upsertProduct` أو تغيير سعر | 403 |
| S8 | باريستا ينشئ حساب ولاء أو يضيف أختاماً | 403 (`loyalty.manage`) |
| S9 | باريستا ينشئ `loyalty_rewards` يدوياً | 403 — المكافأة تُصدَر تلقائياً فقط |
| S10 | باريستا يقرأ `audit_log` | 403 |
| S11 | باريستا يستدعي `noSaleOpen` | 403 |
| S12 | باريستا يستدعي `closeDay` / `reopenDay` | 403 |
| S13 | طلب بلا كوكي جلسة | 401 |
| S14 | كوكي جلسة معدَّلة يدوياً (توقيع HMAC خاطئ) | 401 — لا قبول |
| S15 | جلسة منتهية (>8 ساعات) | 401 |

### 20.2 سلامة البيانات

| # | الحالة | المتوقّع |
|---|---|---|
| S16 | تعديل/حذف صفّ في `inventory_transactions` | مرفوض في القاعدة |
| S17 | تعديل/حذف صفّ في `audit_log` | مرفوض في القاعدة |
| S18 | تعديل/حذف صفّ في `loyalty_ledger` أو `cash_movements` | مرفوض في القاعدة |
| S19 | `UPDATE materials SET cached_stock` | مرفوض — الرصيد من الدفتر |
| S20 | حذف دفعة أو تعديل مبلغها | مرفوض |
| S21 | إرجاع أكبر من المدفوع | مرفوض |
| S22 | صرف مكافأة مصروفة | مرفوض |
| S23 | حقن سعر من المتصفح | متجاهَل — السعر يُقرأ من `product_crops` |
| S24 | حقن كمية وصفة من المتصفح | مستحيل — لا معامل كمية؛ الوصفة من القاعدة (§31) |
| S25 | تمرير `crop_material_id` لمحصول غير متاح | «محصول غير متاح لهذا المشروب» |
| S26 | تمرير `option_id` لمجموعة لا تخصّ المشروب | «خيار غير متاح» |
| S27 | حقن SQL في أي معامل نصّي | معاملات مُهيّأة (`db()` وسوم قوالب) — لا تسلسل نصوص |
| S28 | بيع بعد إغلاق اليوم | مرفوض في القاعدة |
| S29 | بيع والكاشير مقفول | مرفوض في القاعدة |

### 20.3 المصادقة والأسرار

| # | الحالة | المتوقّع |
|---|---|---|
| S30 | ٥ محاولات PIN خاطئة | قفل ٥ دقائق + `login_locked` |
| S31 | قراءة `pin_hash` من أي استجابة | لا يخرج من الخادم أبداً |
| S32 | قراءة `otp_codes.code_hash` | لا يخرج؛ ولا يقرؤه الكاشير أصلاً |
| S33 | `DATABASE_URL` في حزمة المتصفح | مستحيل: `db.ts` معلَّم `server-only` وبلا `NEXT_PUBLIC_` |
| S34 | فهرسة الصفحات أو تضمينها في إطار | `noindex` + `frame-deny` |
| S35 | تعداد المستخدمين من رسالة الدخول | رسالة موحّدة لا تكشف وجود الحساب |

### 20.4 التسريب عبر التقارير

| # | الحالة | المتوقّع |
|---|---|---|
| S36 | شاشة «طلباتي» للباريستا | طلباته هو فقط، بلا مجموع مالي |
| S37 | ردّ `close_shift_blind` | `{"closed": true}` — **بلا متوقّع ولا فرق** |
| S38 | ردّ `checkout` | مبلغ الطلب والباقي فقط — لا تراكمي |
| S39 | شاشة ولاء العميل | أختام ومكافآت — لا تاريخ شراء ولا مبالغ |
| S40 | رسائل الأخطاء | لا تحوي أرقاماً مالية تراكمية |

---

## ملحق أ — ما لا يُبنى في V1 (§64)

نظام محاسبة كامل · ERP · QR إلزامي للعميل · OTP عند كل عملية · إنشاء ولاء
بيد الموظف · نظام نقاط معقّد بدل المشروبات · POS يعمل بلا إنترنت ·
تعدّد الفروع فعلياً (الخطاطيف جاهزة، والتفعيل لاحق) · بوابة دفع.

## ملحق ب — الأرقام القابلة للضبط

كلها في `settings` أو `branches`، لا في الكود:

| المفتاح | الافتراضي | المرجع |
|---|---|---|
| `loyalty.stamps_per_reward` | 5 | §41 |
| `loyalty.max_stamps_per_order` | 4 | §39 |
| `loyalty.reward_max_value` | 5,000 | §42 |
| `loyalty.stamp_expiry_days` | 90 | |
| `loyalty.earn_on_discounted` | true | §40 |
| `branches.variance_threshold_pct` | 3.00 | §34 |
| `branches.standard_float` | حسب الفرع | §22 |
| `materials.dose_grams` | 18 للحبوب | §34 |
| `staff_drink_limit` | 1 لكل وردية | §30 |
| مهلة الجلسة | 8 ساعات | |
| حدّ محاولات PIN | 5 ثم قفل 5 دقائق | |

## ملحق ج — ترتيب البناء (§67)

| المرحلة | الحالة |
|---|---|
| 1. القاعدة: مخطّط · مفاتيح · قيود · فهارس · أنواع · دفتر | ✅ (0001–0016) |
| 2. الدخول والصلاحيات | ✅ قائم · ⏳ الانتقال للمفاتيح المنقّطة |
| 3. المخزون: مواد · وصفات · دفتر · جرد · هدر · مشروب موظف | ✅ |
| 4. البيع: منتجات · طلبات · بنود · دفع · معاملة ذرّية | ✅ |
| 5. الكاش: ورديات · فكّة · سحب · عدّ أعمى · تسليم | ✅ قاعدةً · ⏳ واجهة التسليم وفتح الدرج |
| 6. الولاء: تسجيل · OTP · حساب · دفتر · مكافآت · صرف | ✅ قاعدةً · ⏳ صفحة التسجيل وواجهة الكاشير |
| 7. التقارير | ✅ دوالّ ولقطات · ⏳ الشاشات |
| 8. التدقيق | ✅ |
| 9. كشف الاستثناءات | ✅ `v_exceptions` · ⏳ الشاشة |
| 10. تحسين الواجهة | ⏳ |

---

**قاعدة ذهبية:** أي غموض يُحسم بالنقاش قبل الكود — لا اجتهاد أثناء البرمجة.
