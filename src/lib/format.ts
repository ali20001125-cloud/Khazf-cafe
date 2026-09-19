/**
 * تنسيق العرض — أرقام إنجليزية (Latin) دائماً بطلب المالك.
 * الفلوس أعداد صحيحة بالدينار العراقي. الوقت بتوقيت بغداد.
 */

const NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** مبلغ بالدينار: «3,000 د.ع» بأرقام إنجليزية. */
export function money(n: number, currency = "د.ع"): string {
  return `${NUM.format(Math.round(n))} ${currency}`;
}

/** رقم مجرّد بفواصل إنجليزية (بلا عملة). */
export function num(n: number): string {
  return NUM.format(Math.round(n));
}

/** وحدات المخزون الأساس. */
export function unitLabel(unit: string): string {
  if (unit === "g") return "غم";
  if (unit === "ml") return "مل";
  if (unit === "pcs") return "حبة";
  return unit;
}

/**
 * المخزون بكسرٍ واحد — **لا يُقرَّب للصحيح**.
 *
 * كان يُعرض بـ`NUM` نفسه، وهو مضبوطٌ على صفر كسور لأن الدينار عددٌ صحيح.
 * فصارت ٥٬٥٠٠ غم تُقرأ «٦ كغ»، و٤٬٥٣٢ غم تُقرأ «٥ كغ» — كذبةٌ بـ٤٦٨ غم،
 * أي ستةٍ وعشرين مشروباً. وأخطر مواضعها شاشة الجرد: المالك يعدّ على
 * «المتوقّع» المعروض، فيقيس صحيحه على رقمٍ مغلوط.
 */
const STOCK_NUM = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** عرض كمية المخزون بوحدة مقروءة (كيلو/لتر عند الكبر). */
export function stockLabel(qty: number, unit: string): string {
  if (unit === "g" && qty >= 1000) return `${STOCK_NUM.format(qty / 1000)} كغ`;
  if (unit === "ml" && qty >= 1000) return `${STOCK_NUM.format(qty / 1000)} لتر`;
  return `${num(qty)} ${unitLabel(unit)}`;
}

/**
 * الكمية بوحدة الأساس نفسها، بلا تقريبٍ ولا كسر: «5,460 غ».
 *
 * `stockLabel` تُقرّب لكسرٍ واحد — مريحةٌ للتصفّح، كاذبةٌ حيث يُقاس عليها:
 * ٤٩٬٩٨٠ غ تُقرأ «50 كغ»، فيكتب المالك 50 ويصنع فرقاً وهمياً بعشرين
 * غراماً. فحيث يُقارن المعروضُ بما يُكتَب — شاشة الجرد والإضافة — يُعرض
 * الرقم كما هو.
 */
export function baseQtyLabel(qty: number, unit: string): string {
  if (unit === "g") return `${num(qty)} غ`;
  if (unit === "ml") return `${num(qty)} مل`;
  return countAr(qty, "حبة", "حبتان", "حبات");
}

/**
 * العدد بجمعه العربي الصحيح.
 *
 * العربية تعدّ على أربعة وجوه — واحد · اثنان · ٣‑١٠ جمعٌ · ١١+ مفرد منصوب —
 * و«6 كوباً» أو «3 حبة» تُقرأ كترجمةٍ آليّة فتُضعف الثقة بالرقم نفسه.
 */
export function countAr(n: number, one: string, two: string, few: string): string {
  const k = Math.round(n);
  if (k === 1) return one;
  if (k === 2) return two;
  if (k >= 3 && k <= 10) return `${num(k)} ${few}`;
  return `${num(k)} ${one}`;
}

/**
 * «كم مشروباً يعادل هذا الرقم؟» — الترجمة التي تجعل النقص مفهوماً.
 * نسبةٌ صغيرة على مخزون كبير تُخفي مشروبات كاملة، فنقولها بالمشروبات.
 * الجمع العربي: مشروب واحد · مشروبان · ٣-١٠ مشروبات · ١١+ مشروباً.
 */
export function drinksLabel(doses: number): string {
  const n = Math.round(doses);
  if (n <= 0) return "أقلّ من مشروب";
  if (n === 1) return "مشروب واحد";
  if (n === 2) return "مشروبين";
  return countAr(n, "مشروباً", "مشروبين", "مشروبات");
}

/**
 * اسم النوع كما يُقرأ، لا كما يُخزَّن.
 *
 * «بن كالدي — للبيع» و«حبوب كالدي» اسمان للشيء نفسه في مكانين: الأوّل
 * كيسٌ يُباع، والثاني ما يُطحن. اللاحقة والبادئة تفيدان في المخزون حيث
 * يتجاوران، ويصيران ضجيجاً حيث لا يتجاوران — في المنيو وفي تفصيل
 * المبيعات، حيث المقروء هو **النوع**: كالدي.
 */
export function kindName(name: string): string {
  return name
    .replace(/\s*—\s*للبيع\s*$/, "")
    .replace(/^\s*(?:حبوب|بن)\s+/, "")
    .trim() || name;
}

export function categoryLabel(c: string): string {
  if (c === "hot") return "ساخن";
  if (c === "cold") return "بارد";
  if (c === "espresso") return "إسبريسو";
  if (c === "filter") return "مختص";
  return "أخرى";
}

/** الوقت بتوقيت بغداد، بأرقام إنجليزية. */
export function timeAr(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("en-GB", {
    timeZone: "Asia/Baghdad",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
