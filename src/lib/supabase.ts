import "server-only";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // نفشل بوضوح بدل ما نشتغل بلا قاعدة بيانات
  console.warn("[khazf-pos] متغيّرات Supabase ناقصة — راجع .env.local");
}

/**
 * عميل الخادم فقط. يستعمل مفتاح service_role، لذا لا يُستورد أبداً
 * في مكوّن يعمل بالمتصفح. كل RLS مقفلة، والوصول من هنا حصراً.
 */
export const db = createClient(url ?? "http://localhost", serviceKey ?? "missing", {
  auth: { persistSession: false, autoRefreshToken: false },
});
