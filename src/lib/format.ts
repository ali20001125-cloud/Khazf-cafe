/** الدينار بلا كسور، بفواصل عربية سهلة القراءة. */
export function money(n: number, currency = "د.ع"): string {
  return `${new Intl.NumberFormat("ar-IQ", { maximumFractionDigits: 0 }).format(n)} ${currency}`;
}

export function unitLabel(unit: string): string {
  if (unit === "gram") return "غم";
  if (unit === "ml") return "مل";
  return "حبة";
}

export function categoryLabel(c: string): string {
  if (c === "hot") return "ساخن";
  if (c === "cold") return "بارد";
  if (c === "espresso") return "إسبريسو";
  return "مختص";
}

export function timeAr(iso: string): string {
  return new Date(iso).toLocaleString("ar-IQ", {
    dateStyle: "short",
    timeStyle: "short",
  });
}
