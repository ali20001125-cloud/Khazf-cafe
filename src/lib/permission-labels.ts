/**
 * نصوص الصلاحيات وتصنيفها — يستوردها الخادم والواجهة معاً، فلا تمسّ القاعدة.
 * (فصلها ضروري: مكوّن العميل لا يستورد ملفاً معلَّماً `server-only`.)
 */

/** ما لا يُمنح لموظف مهما كان — ولكلٍّ سببٌ يُعرض، لا مجرّد قفل. */
export const OWNER_ONLY: Record<string, string> = {
  "users.manage": "من يملك هذا يُنشئ لنفسه حساباً آخر بصلاحيات كاملة.",
  "settings.manage": "الإعدادات فيها الفكّة وحدود الفروقات — من يغيّرها يغيّر ما يُكشف به.",
  "branches.manage": "إدارة الفروع شأن ملكية لا تشغيل.",
  "approvals.grant": "من يوافق على نفسه لا تبقى للموافقة قيمة.",
  "day.reopen": "إعادة فتح يوم مُغلق تسمح بتعديل حسابٍ أُقفل.",
  "audit.view": "سجلّ التدقيق هو ما يُراجَع به الموظف، فلا يُدار من قِبله.",
  "prices.manage": "من يغيّر السعر يبيع بسعرٍ ويسجّل آخر.",
  "pos.lock": "قفل الكاشير وسيلة المالك لإيقاف البيع.",
};

/** صلاحيات تُمنح أحياناً، لكن لكلٍّ ثمنٌ يجب أن يُقال قبل منحه. */
export const RISKY: Record<string, string> = {
  "cash.view_expected":
    "يكسر العدّ الأعمى: لو رأى الباريستا المبلغ المتوقّع كتبه كما هو، فلا يظهر نقص أبداً. لا تمنحها.",
  "reports.financial": "يرى الإيراد والأرباح — أرقام المحلّ كلّها.",
  "payments.void": "إلغاء فاتورة مدفوعة يُخرج البيع من الحساب.",
  "payments.refund": "إخراج مال من الدرج.",
  "cash.drop": "سحب نقد أثناء الوردية.",
  "cash.remove": "سحب المبيعات عند الإغلاق.",
  "cash.no_sale_open": "فتح الدرج بلا بيع — يُسجَّل، لكنه يبقى باباً.",
  "inventory.adjust": "تغيير الرصيد بلا شراء ولا بيع — به يُستر النقص.",
  "discounts.apply_sensitive": "خصم يتجاوز السقف.",
  "staff_drinks.approve": "الموافقة على تجاوز حدّ مشروبات الموظفين لنفسه.",
  "loyalty.manage": "تعديل حسابات الولاء يدوياً.",
};

/** ترتيب المجموعات وأسماؤها كما يراها المالك. */
export const GROUPS: { scope: string; title: string; hint: string }[] = [
  { scope: "orders", title: "البيع", hint: "ما يفعله الباريستا في الكاشير" },
  { scope: "payments", title: "الدفع والإرجاع", hint: "المال الداخل والخارج" },
  { scope: "cash", title: "الدرج والوردية", hint: "فتح الوردية وعدّ الدرج وإغلاقه" },
  { scope: "inventory", title: "المخزون", hint: "الاستلام والهدر والجرد" },
  { scope: "staff", title: "مشروبات الموظفين", hint: "" },
  { scope: "discounts", title: "الخصومات", hint: "" },
  { scope: "loyalty", title: "الولاء", hint: "" },
  { scope: "catalog", title: "المشروبات والأسعار", hint: "" },
  { scope: "reports", title: "التقارير", hint: "" },
  { scope: "day", title: "إغلاق اليوم", hint: "" },
  { scope: "admin", title: "الإدارة", hint: "" },
];

export type PermRow = {
  key: string;
  scope: string;
  label: string;
  granted: boolean;
  /** سبب المنع إن كانت للمالك وحده */
  ownerOnly: string | null;
  /** ثمن منحها إن كانت خطرة */
  risk: string | null;
};
