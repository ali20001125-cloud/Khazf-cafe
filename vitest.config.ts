import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * `server-only` حزمةٌ تنفجر عمداً حين تُستورَد خارج الخادم — وهذا صحيح
 * في البناء، وعائقٌ في الاختبار: الاختبار ليس متصفّحاً، لكنه ليس خادم
 * Next أيضاً، فتظنّه الحزمة عميلاً وترفض.
 *
 * فتُستبدل هنا بملفٍّ فارغ. الضمانة لا تُفقد: `next build` هو من يفرضها
 * في الحزمة التي تصل المتصفّح، وهذا الملفّ لا يدخل في ذلك البناء.
 */
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
