import "server-only";
import { db } from "./db";

/**
 * أكواد الخصم.
 *
 * **الميزة الوحيدة التي تُنقص المال في الدرج بأمرٍ من خارج المحلّ.**
 * ولذلك لكلّ كودٍ سقفان — عددُ مرّات وتاريخُ انتهاء — وكلاهما مطلوب.
 * كودٌ بلا سقفٍ يُصوَّر ويُنشر في مجموعة واتساب، فيأتي مئةٌ بخصم النصف
 * في يومٍ واحد ويُكتشف ذلك مساءً.
 */

export type PromoRow = {
  id: string;
  code: string;
  kind: "percent" | "amount";
  value: number;
  minTotal: number;
  maxDiscount: number | null;
  maxUses: number;
  usedCount: number;
  startsAt: string;
  expiresAt: string;
  active: boolean;
  /** ما حُسم فعلاً بهذا الكود — لا العدد وحده. */
  totalGiven: number;
};

export async function promoList(businessId: string): Promise<PromoRow[]> {
  const rows = (await db()`
    select p.id, p.code, p.kind::text as kind, p.value, p.min_total, p.max_discount,
           p.max_uses, p.used_count, p.starts_at, p.expires_at, p.active,
           coalesce((select sum(u.discount) from promo_uses u where u.promo_id = p.id), 0)::int
             as total_given
    from promo_codes p
    where p.business_id = ${businessId}
    order by p.active desc, p.expires_at desc
  `) as {
    id: string; code: string; kind: "percent" | "amount"; value: number;
    min_total: number; max_discount: number | null; max_uses: number;
    used_count: number; starts_at: string; expires_at: string;
    active: boolean; total_given: number;
  }[];

  return rows.map((r) => ({
    id: r.id,
    code: r.code,
    kind: r.kind,
    value: Number(r.value),
    minTotal: Number(r.min_total),
    maxDiscount: r.max_discount === null ? null : Number(r.max_discount),
    maxUses: Number(r.max_uses),
    usedCount: Number(r.used_count),
    startsAt: String(r.starts_at),
    expiresAt: String(r.expires_at),
    active: r.active,
    totalGiven: Number(r.total_given),
  }));
}
