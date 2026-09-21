import "server-only";
import { db } from "./db";

/**
 * بريد آراء الزبائن.
 *
 * خاصٌّ عمداً: لا نجوم على المنيو. صفحةٌ بلا تقييمات تبدو مهجورة قبل
 * أن يفتح المحلّ، وأوّل غاضبٍ في يومٍ سيّئ يترك نجمةً تبقى فوق المشروب
 * شهوراً لا يملك المالك حذفها — وإن ملكه صارت التقييمات دعاية.
 */

export type FeedbackRow = {
  id: string;
  rating: number | null;
  note: string | null;
  productName: string | null;
  phone: string | null;
  read: boolean;
  createdAt: string;
};

export async function feedbackInbox(
  businessId: string,
  limit = 60
): Promise<FeedbackRow[]> {
  const rows = (await db()`
    select f.id, f.rating, f.note, p.name as product_name, f.phone,
           f.read_at is not null as read, f.created_at
    from feedback f
    left join products p on p.id = f.product_id
    where f.business_id = ${businessId}
    order by f.created_at desc
    limit ${limit}
  `) as {
    id: string; rating: number | null; note: string | null;
    product_name: string | null; phone: string | null;
    read: boolean; created_at: string;
  }[];

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating === null ? null : Number(r.rating),
    note: r.note,
    productName: r.product_name,
    phone: r.phone,
    read: r.read,
    createdAt: String(r.created_at),
  }));
}

/** عدد ما لم يُقرأ — للشارة في اللوحة. */
export async function unreadFeedback(businessId: string): Promise<number> {
  const rows = (await db()`
    select count(*)::int as n from feedback
    where business_id = ${businessId} and read_at is null
  `) as { n: number }[];
  return rows[0]?.n ?? 0;
}
