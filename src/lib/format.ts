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

/** عرض كمية المخزون بوحدة مقروءة (كيلو/لتر عند الكبر). */
export function stockLabel(qty: number, unit: string): string {
  if (unit === "g" && qty >= 1000) return `${NUM.format(Math.round(qty / 100) / 10)} كغ`;
  if (unit === "ml" && qty >= 1000) return `${NUM.format(Math.round(qty / 100) / 10)} لتر`;
  return `${num(qty)} ${unitLabel(unit)}`;
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
