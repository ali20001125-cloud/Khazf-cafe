"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePermission, AuthError } from "@/lib/permissions";
import { deleteImage, imageKey, putImage, sniffImage, storageConfigured } from "@/lib/storage";

/**
 * لا `image_url` هنا: الصورة تُرفع من الهاتف بفعلٍ مستقلّ (أسفل)، ولا
 * تُكتب بإلصاق رابط. وإبقاء الحقل مقبولاً هنا يعني بابَ كتابةٍ على
 * `image_url` لم تعد تستعمله الشاشة — وبابٌ لا يمرّ به أحد لا يُحرَس.
 */
export type MenuPatch = {
  id: string;
  menu_visible?: boolean;
  menu_note?: string;
  special?: boolean;
};

/**
 * ما يُعرض على الزبون وما يُقال تحته.
 *
 * لا سعر هنا ولا وصفة: السعر بيته `product_crops` ويُعدَّل من «المنتجات»،
 * وإعدادٌ بمكانين يعني أن المالك قد يغيّر واحداً ويقرأ النظام الآخر.
 */
export async function updateMenuAction(
  patches: MenuPatch[]
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const clean = patches.filter((p) => p.id);
  if (clean.length === 0) return { ok: false, error: "لا تغييرات" };

  try {
    for (const p of clean) {
      if (typeof p.menu_visible === "boolean") {
        await db()`
          update products set menu_visible = ${p.menu_visible}
          where id = ${p.id} and business_id = ${user.bid}
        `;
      }
      if (typeof p.menu_note === "string") {
        // سطرٌ فارغ يعني «لا سطر»، لا سطراً من فراغ
        const note = p.menu_note.trim().slice(0, 160);
        await db()`
          update products set menu_note = ${note.length > 0 ? note : null}
          where id = ${p.id} and business_id = ${user.bid}
        `;
      }
      if (typeof p.special === "boolean") {
        await db()`
          update products set is_daily_special = ${p.special}
          where id = ${p.id} and business_id = ${user.bid}
        `;
      }
    }
    await db()`
      insert into audit_log (business_id, user_id, action, entity_type, reason)
      values (${user.bid}, ${user.uid}, 'menu_change', 'product',
              ${`تعديل منيو ${clean.length} منتجاً`})
    `;
    revalidatePath("/menu");
    revalidatePath("/manage/menu");
    return { ok: true, saved: clean.length };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}

/**
 * رفع صورة منتج من الهاتف.
 *
 * قال المالك: «خليها تُضاف أو تُرفع من الهاتف، وليس أضف رابط الصورة».
 * والرابط كان خطأً من أصله: صورةٌ على موقع غيرك تُحذف أو تُحجب فيرى
 * الزبون مربّعاً مكسوراً على الطاولة، ولا تعرف أنت متى وقع ذلك.
 *
 * والصورة تُصغَّر في الهاتف قبل أن تُرسل (انظر `ImageField`) — حمولةُ
 * الزبون أثمن من دقّةٍ لا تُرى في مربّعٍ صغير.
 */
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export async function uploadProductImageAction(
  productId: string,
  form: FormData
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  if (!storageConfigured())
    return { ok: false, error: "التخزين غير مضبوط — راجع إعدادات الاستضافة" };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "لم تُختَر صورة" };
  if (file.size > MAX_UPLOAD_BYTES)
    return { ok: false, error: "الصورة كبيرة — اختر أصغر" };

  const owns = (await db()`
    select image_url from products where id = ${productId} and business_id = ${user.bid}
  `) as { image_url: string | null }[];
  if (!owns[0]) return { ok: false, error: "منتج غير موجود" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind.ok) return { ok: false, error: "الملفّ ليس صورة (JPG · PNG · WebP)" };

  const put = await putImage(imageKey(productId, kind.ext), bytes, kind.type);
  if (!put.ok) return { ok: false, error: put.error };

  await db()`
    update products set image_url = ${put.url}
    where id = ${productId} and business_id = ${user.bid}
  `;

  // القديمة تُحذف **بعد** أن تُحفظ الجديدة: لو انعكس الترتيب وفشل الرفع
  // لبقي المنتج بلا صورة وقد كانت له واحدة
  const old = owns[0].image_url;
  if (old && old !== put.url) await deleteImage(old);

  revalidatePath("/menu");
  revalidatePath("/manage/menu");
  return { ok: true, url: put.url };
}

/**
 * اسم البنّ على الطاولة.
 *
 * حقلٌ مستقلّ لا إعادة تسمية: «حبوب كالدي» يبقى في المخزون والجرد
 * والتكاليف — لأنك تشتريه وتعدّه بهذا الاسم — و`menu_label` وحده هو
 * ما يُقرأ عند الزبون.
 *
 * والفراغ يعود إلى الصمت لا إلى اسم المخزن: من مسح الحقل قصد أن
 * يُخفي المحصول، لا أن يكشفه.
 */
export async function updateBeanLabelsAction(
  rows: { id: string; label: string }[]
): Promise<{ ok: true; saved: number } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }

  const clean = rows.filter((r) => r.id);
  if (clean.length === 0) return { ok: false, error: "لا تغييرات" };

  try {
    for (const r of clean) {
      const label = r.label.trim().slice(0, 60);
      await db()`
        update materials set menu_label = ${label.length > 0 ? label : null}
        where id = ${r.id} and business_id = ${user.bid}
      `;
    }
    revalidatePath("/menu");
    revalidatePath("/manage/menu");
    return { ok: true, saved: clean.length };
  } catch {
    return { ok: false, error: "تعذّر الحفظ" };
  }
}

/** إزالة الصورة — يعود الرسم مكانها، فلا يبقى مربّعٌ فارغ. */
export async function removeProductImageAction(
  productId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let user;
  try {
    user = await requirePermission("products.manage");
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: e.message };
    throw e;
  }
  const rows = (await db()`
    select image_url from products where id = ${productId} and business_id = ${user.bid}
  `) as { image_url: string | null }[];
  if (!rows[0]) return { ok: false, error: "منتج غير موجود" };

  await db()`
    update products set image_url = null
    where id = ${productId} and business_id = ${user.bid}
  `;
  if (rows[0].image_url) await deleteImage(rows[0].image_url);

  revalidatePath("/menu");
  revalidatePath("/manage/menu");
  return { ok: true };
}
