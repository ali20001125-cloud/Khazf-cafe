/**
 * مكوّنات المشروب كما تُقال للزبون — أسماءٌ بلا كميّات.
 *
 * قال المالك: «لا تكتب كمية الحليب، بل حليب مبخّر». الكميّة لغة
 * المخزن (١٨٠ مل تُخصم من الرصيد)، والزبون يسأل **ماذا في كوبي** لا
 * **كم**. و«حليب مبخّر» تقول له ما لا يقوله «حليب ١٨٠ مل»: أنه ساخنٌ
 * بقوامٍ ناعم.
 *
 * فالمالك يكتب السطر بنفسه في «المنيو»، مفصولاً بـ «·» أو فاصلة. وما لم
 * يُكتب يُعرض من الوصفة — أسماءً وحدها.
 */
export function splitIngredients(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of text.split(/[·•,،\n]+/)) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** للحفظ: الشكل الواحد الذي يُكتب في القاعدة — «أ · ب · ج». */
export function joinIngredients(text: string): string {
  return splitIngredients(text).join(" · ");
}
