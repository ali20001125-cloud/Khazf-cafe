"use client";

import { useState, useTransition } from "react";
import Modal from "@/components/Modal";
import type { CatalogProduct } from "@/lib/catalog";
import type { LoyaltyAccountView, AvailableReward } from "@/lib/loyalty";
import { lookupCustomer, redeemReward } from "@/app/pos/loyalty-actions";

/**
 * ولاء الزبون في شاشة الكاشير (المواصفة §38 · §42).
 *
 * الباريستا يبحث بالرقم فقط. لا ينشئ حساباً ولا يضيف ختماً — والشاشة
 * لا تعرض أي مبلغ ولا تاريخ شراء، فقط الأختام والمكافآت.
 */

export type LinkedCustomer = { id: string; phone: string; name: string | null; stamps: number };

export default function CustomerPanel({
  catalog,
  fulfillment,
  linked,
  onLink,
  onUnlink,
  onRedeemed,
  onClose,
}: {
  catalog: CatalogProduct[];
  fulfillment: "takeaway" | "dine_in";
  linked: LinkedCustomer | null;
  onLink: (c: LinkedCustomer) => void;
  onUnlink: () => void;
  onRedeemed: (orderNumber: number) => void;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState(linked?.phone ?? "");
  const [account, setAccount] = useState<LoyaltyAccountView | null>(null);
  const [rewards, setRewards] = useState<AvailableReward[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // اختيار المشروب المجاني
  const [redeemFor, setRedeemFor] = useState<string | null>(null);
  const [pickProduct, setPickProduct] = useState<CatalogProduct | null>(null);

  function search() {
    setError(null);
    start(async () => {
      const r = await lookupCustomer(phone);
      if (!r.ok) {
        setAccount(null);
        setRewards([]);
        setError(r.error);
        return;
      }
      setAccount(r.account);
      setRewards(r.rewards);
      onLink({
        id: r.account.customer_id,
        phone: r.account.phone,
        name: r.account.name,
        stamps: r.account.stamps_display,
      });
    });
  }

  function doRedeem(product: CatalogProduct, cropMaterialId: string) {
    if (!redeemFor) return;
    setError(null);
    const key =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    start(async () => {
      const r = await redeemReward({
        rewardId: redeemFor,
        productId: product.id,
        cropMaterialId,
        fulfillment,
        idempotencyKey: key,
      });
      if (!r.ok) return setError(r.error);
      onRedeemed(r.orderNumber);
    });
  }

  // شاشة اختيار المحصول للمشروب المجاني
  if (pickProduct) {
    const avail = pickProduct.crops.filter((c) => c.available);
    return (
      <Modal title={`${pickProduct.name} — اختر المحصول`} onClose={() => setPickProduct(null)}>
        <div className="space-y-2">
          {avail.map((c) => (
            <button
              key={c.material_id}
              disabled={pending}
              onClick={() => doRedeem(pickProduct, c.material_id)}
              className="tap w-full rounded-xl border border-line bg-cream p-4 text-right font-display font-bold text-ink disabled:opacity-50"
            >
              {c.crop_name}
            </button>
          ))}
          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        </div>
      </Modal>
    );
  }

  // شاشة اختيار المشروب المجاني
  if (redeemFor) {
    const eligible = catalog.filter((p) => !p.paused && p.crops.some((c) => c.available));
    return (
      <Modal title="اختر المشروب المجاني" onClose={() => setRedeemFor(null)}>
        <p className="mb-3 text-sm text-muted">
          يُنشأ طلب مستقلّ بإجمالي <span className="nums">0</span> — بلا كاش وبلا فتح درج.
        </p>
        <div className="grid max-h-[50vh] grid-cols-2 gap-2 overflow-y-auto">
          {eligible.map((p) => (
            <button
              key={p.id}
              disabled={pending}
              onClick={() => {
                const avail = p.crops.filter((c) => c.available);
                if (avail.length === 1) doRedeem(p, avail[0].material_id);
                else setPickProduct(p);
              }}
              className="tap card flex h-20 items-center justify-center px-2 text-center font-display text-sm font-bold text-ink disabled:opacity-50"
            >
              {p.name}
            </button>
          ))}
        </div>
        {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal title="ولاء الزبون" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="cphone" className="mb-1.5 block text-sm font-semibold text-ink">
            رقم هاتف الزبون
          </label>
          <div className="flex gap-2">
            <input
              id="cphone"
              className="field nums flex-1 text-lg"
              inputMode="tel"
              placeholder="07XX XXX XXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <button onClick={search} disabled={pending || !phone} className="btn-primary px-5 py-3">
              {pending ? "…" : "بحث"}
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-sm font-medium text-amber-900">{error}</p>
            <p className="mt-1 text-xs text-amber-800">
              التسجيل يتمّ من رمز QR في المحل — لا يُنشئه الكاشير.
            </p>
          </div>
        )}

        {account && (
          <div className="rounded-2xl bg-sand p-4">
            <div className="flex items-baseline justify-between">
              <span className="font-display font-bold text-ink">{account.name || "زبون"}</span>
              <span className="nums text-sm text-muted">{account.phone}</span>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="nums font-display text-3xl font-bold text-ink">
                {account.stamps_display}
              </span>
              <span className="text-sm text-muted">ختم</span>
            </div>

            {account.rewards_available > 0 ? (
              <div className="mt-3 space-y-2">
                <p className="rounded-xl bg-green-50 px-3 py-2 text-sm font-semibold text-green-800">
                  🎁 <span className="nums">{account.rewards_available}</span> مشروب مجاني متاح
                </p>
                {rewards.map((rw, i) => (
                  <button
                    key={rw.id}
                    onClick={() => setRedeemFor(rw.id)}
                    className="btn-primary w-full py-3 text-base"
                  >
                    صرف المكافأة {rewards.length > 1 ? `#${i + 1}` : ""}
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">لا توجد مكافأة متاحة بعد.</p>
            )}
          </div>
        )}

        {linked && (
          <div className="flex items-center justify-between rounded-xl border border-line bg-cream p-3">
            <span className="text-sm text-ink">
              مربوط بالفاتورة: <span className="nums font-semibold">{linked.phone}</span>
            </span>
            <button onClick={onUnlink} className="text-sm text-muted underline">
              فكّ الربط
            </button>
          </div>
        )}

        <p className="text-xs text-muted">
          الأختام تُحتسب تلقائياً عند إتمام الدفع — لا تُضاف يدوياً.
        </p>
      </div>
    </Modal>
  );
}
