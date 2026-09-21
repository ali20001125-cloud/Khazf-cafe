import "server-only";
import { db } from "./db";

/**
 * ما يحتاج انتباه المالك.
 *
 * اللوحة كلّها كانت تقول **ما جرى**: كم بيع، كم ربح، ماذا شذّ. وهذا
 * تاريخ. ولم تكن تقول **ما ينبغي أن يُفعل اليوم** — والمالك يفتحها في
 * الصباح ليعرف ذلك بالضبط.
 *
 * وكل بند هنا شرطه واحد: **أن يكون له فعلٌ معلوم**. «انخفضت المبيعات»
 * ليس بنداً — لا يقول لأحدٍ ما يعمل. أمّا «بقي من حبوب كالدي ما يكفي
 * ١٢ كوباً» فيقول: اشترِ.
 *
 * ومرتّبة بالإلحاح لا بالنوع: ما يوقف البيع اليوم قبل ما يُزعج الشهر
 * القادم.
 */

export type TaskTone = "stop" | "warn" | "info";

export type OwnerTask = {
  key: string;
  tone: TaskTone;
  title: string;
  /** لماذا يهمّ — بجملةٍ تقول العاقبة لا تعيد العنوان. */
  why: string;
  href: string;
  cta: string;
};

/** ترتيبٌ ثابت: ما يوقف العمل أوّلاً. */
const RANK: Record<TaskTone, number> = { stop: 0, warn: 1, info: 2 };

/**
 * `branchId` ليس مُهمَلاً بالصدفة: ما يخصّ الفرع (الورديات والدروج) له
 * بطاقاتٌ مخصّصة في اللوحة **تفعل** لا تُشير — تَعُدّ الدرج في مكانها
 * وتُغلق الوردية العالقة. وتكراره هنا إشارةً يُنتج تنبيهين لشيءٍ واحد،
 * وهو بالضبط الازدحام الذي تُعالجه هذه الشاشة.
 */
export async function ownerTasks(businessId: string): Promise<OwnerTask[]> {
  const out: OwnerTask[] = [];

  // استعلامٌ واحد يجمع ما يحتاجه كل البنود: اللوحة تُفتح كثيراً، وعشرة
  // استعلاماتٍ صغيرة تُبطئها بلا داعٍ
  const rows = (await db()`
    select
      (select count(*) from users
        where business_id = ${businessId} and active and pin_changed_at is null)::int
        as default_pins,

      (select count(*) from materials
        where business_id = ${businessId} and active
          and low_threshold > 0 and cached_stock <= low_threshold)::int
        as low_stock,

      (select count(*) from materials
        where business_id = ${businessId} and active and cached_stock < 0)::int
        as negative_stock,

      -- منتجٌ بسعرٍ صفريّ أو رمزيّ يُباع فيُسجَّل إيرادٌ كاذب
      (select count(*) from products p
        where p.business_id = ${businessId} and p.active
          and exists (select 1 from product_crops pc
                      where pc.product_id = p.id and pc.available and pc.price <= 1))::int
        as unpriced,

      -- مادّةٌ بلا تكلفة: كل ما يُباع منها يظهر ربحاً كاملاً
      (select count(*) from materials
        where business_id = ${businessId} and active
          and current_cost <= 0 and base_unit <> 'pcs')::int
        as no_cost
  `) as {
    default_pins: number; low_stock: number;
    negative_stock: number; unpriced: number; no_cost: number;
  }[];

  const r = rows[0];
  if (!r) return out;

  if (r.negative_stock > 0)
    out.push({
      key: "negative_stock",
      tone: "stop",
      title: `${r.negative_stock} مادة رصيدها بالسالب`,
      why: "بِيع منها أكثر ممّا دخل. إمّا شراءٌ لم يُسجَّل، وإمّا جردٌ غلط — والتكلفة محسوبة خطأً حتى يُصحَّح.",
      href: "/manage/inventory",
      cta: "افحص المخزون",
    });

  if (r.unpriced > 0)
    out.push({
      key: "unpriced",
      tone: "warn",
      title: `${r.unpriced} صنف بلا سعر حقيقي`,
      why: "سعره دينارٌ أو صفر. لو بِيع، دخل الدرج أقلّ ممّا يجب وسجّل النظام إيراداً كاذباً.",
      href: "/manage/products",
      cta: "ضع الأسعار",
    });

  if (r.low_stock > 0)
    out.push({
      key: "low_stock",
      tone: "warn",
      title: `${r.low_stock} مادة قاربت النفاد`,
      why: "بلغت حدّ التنبيه الذي وضعتَه. والنفاد وسط الخدمة يوقف مشروباً لا يُعوَّض بيعه.",
      href: "/manage/shopping",
      cta: "قائمة الشراء",
    });

  if (r.no_cost > 0)
    out.push({
      key: "no_cost",
      tone: "warn",
      title: `${r.no_cost} مادة بلا تكلفة مسجّلة`,
      why: "تكلفتها صفر، فكل ما يُصنع منها يظهر ربحاً كاملاً — ورقم الربح أعلى من الحقيقة.",
      href: "/manage/inventory",
      cta: "سجّل التكلفة",
    });

  if (r.default_pins > 0)
    out.push({
      key: "default_pins",
      tone: "warn",
      title: `${r.default_pins} حساب برمزٍ افتراضي`,
      why: "الرمز الافتراضي معروفٌ لمن رأى النظام. ومن دخل به يبيع ويُلغي باسم صاحبه.",
      href: "/manage/users",
      cta: "غيّر الرموز",
    });

  return out.sort((a, b) => RANK[a.tone] - RANK[b.tone]);
}
