"use client";

import { useCallback, useEffect, useState } from "react";
import { pay } from "@/app/pos/actions";
import { pending, remove, markFailed, type QueuedSale } from "@/lib/offline-queue";
import { money } from "@/lib/format";

/**
 * شريط حالة الاتصال ورفع الفواتير المؤجّلة.
 *
 * يظهر فقط حين يكون هناك ما يُقال: انقطاع، أو فواتير بانتظار الرفع، أو
 * فاتورة رفضها الخادم. وفي الحالة الطبيعية لا يشغل من الشاشة شيئاً.
 *
 * قاعدته: **لا يُحذف بيع إلا بتأكيد الخادم.** الرفض لا يُبتلع ولا يُعاد
 * إلى ما لا نهاية — يُعرض للباريستا بسببه، لأن فاتورة عالقة معناها مالٌ
 * في الدرج بلا سند، وذلك فرقٌ سيظهر عند العدّ.
 */
export default function OfflineSync({ currency }: { currency: string }) {
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<QueuedSale[]>([]);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => setQueue(pending()), []);

  const drain = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    const list = pending();
    if (list.length === 0) return;

    setSyncing(true);
    try {
      // بالترتيب لا بالتوازي: أرقام الفواتير تتسلسل بترتيب الرفع، فيبقى
      // ترتيبها موافقاً لترتيب البيع الفعلي.
      for (const s of list) {
        try {
          const res = await pay({
            items: s.items,
            fulfillment: s.fulfillment,
            method: s.method,
            tendered: s.tendered,
            idempotencyKey: s.idempotencyKey,
            customerId: s.customerId,
            occurredAt: s.occurredAt,
            shiftId: s.shiftId,
          });
          if (res.ok) remove(s.idempotencyKey);
          else markFailed(s.idempotencyKey, res.error);
        } catch {
          // الشبكة سقطت من جديد — نتوقّف ونُبقي الباقي كما هو
          break;
        }
      }
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [syncing, refresh]);

  useEffect(() => {
    setOnline(navigator.onLine);
    refresh();
    const up = () => {
      setOnline(true);
      void drain();
    };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    // محاولة عند الفتح، ثم كل دقيقة: حدث `online` لا يُطلق دائماً حين
    // تعود الشبكة فعلاً (شبكة موجودة بلا إنترنت مثلاً).
    void drain();
    const t = setInterval(() => void drain(), 60_000);
    return () => {
      window.removeEventListener("online", up);
      window.removeEventListener("offline", down);
      clearInterval(t);
    };
  }, [drain, refresh]);

  const stuck = queue.filter((s) => s.lastError && s.attempts >= 3);
  if (online && queue.length === 0) return null;

  return (
    <div className="space-y-1 px-4 pt-2">
      {!online && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/15 px-3 py-2 text-sm text-amber-100">
          <span className="font-semibold">بلا إنترنت.</span> البيع مستمرّ ويُحفظ
          في الجهاز، ويُرفع تلقائياً حين تعود الشبكة.
        </div>
      )}

      {queue.length > 0 && (
        <div className="rounded-xl border border-cream/20 bg-cream/5 px-3 py-2 text-sm text-cream/85">
          <span className="nums font-semibold">{queue.length}</span>{" "}
          {queue.length === 1 ? "فاتورة" : "فاتورة"} بانتظار الرفع
          {syncing && <span className="mr-2 text-cream/60">… يُرفع الآن</span>}
          {online && !syncing && (
            <button onClick={() => void drain()} className="mr-2 underline">
              ارفعها الآن
            </button>
          )}
          <span className="mr-2 text-cream/60">
            (المجموع {money(queue.reduce((a, s) => a + s.total, 0), currency)})
          </span>
        </div>
      )}

      {stuck.length > 0 && (
        <div className="rounded-xl border border-red-400/50 bg-red-400/20 px-3 py-2 text-sm text-red-100">
          <span className="font-semibold">
            {stuck.length === 1 ? "فاتورة رفضها النظام" : `${stuck.length} فواتير رفضها النظام`}:
          </span>{" "}
          {stuck[0].lastError}
          <span className="mt-0.5 block text-xs text-red-100/80">
            راجع المالك. المال في الدرج بلا فاتورة، وسيظهر فرقاً عند العدّ.
          </span>
        </div>
      )}
    </div>
  );
}
