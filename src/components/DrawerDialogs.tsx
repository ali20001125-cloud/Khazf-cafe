"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import {
  noSaleOpenAction,
  listHandoverTargets,
  startHandoverAction,
  confirmHandoverAction,
  type StaffOption,
} from "@/app/pos/shift-actions";

/** فتح الدرج بلا بيع (§28) — حدث مسجَّل باسم وسبب، لا زرّ صامت. */
export function NoSaleDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const PRESETS = ["تبديل فكّة للزبون", "ترتيب الدرج", "جرد نقدي", "خطأ إدخال"];

  function submit() {
    if (!reason.trim()) return setError("اكتب السبب");
    setError(null);
    start(async () => {
      const r = await noSaleOpenAction(reason);
      if (!r.ok) return setError(r.error);
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="فتح الدرج بلا بيع" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        يُسجَّل باسمك ووقته وسببه، ويظهر في لوحة المالك. لا يُفتح الدرج بلا سبب.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setReason(p)}
            className={`tap chip border ${
              reason === p ? "border-accent bg-accent/15 text-accentdeep" : "border-line bg-cream text-muted"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      <input
        className="field mb-3"
        placeholder="السبب"
        value={reason}
        onChange={(e) => {
          setReason(e.target.value);
          setError(null);
        }}
      />
      {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
      <button onClick={submit} disabled={pending} className="btn-primary w-full">
        {pending ? "…" : "تسجيل وفتح الدرج"}
      </button>
    </Modal>
  );
}

/** تسليم الدرج (§27) — عدّ أعمى من المُسلِّم، وتأكيد من المُستلِم. */
export function HandoverDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [to, setTo] = useState("");
  const [counted, setCounted] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    listHandoverTargets().then((r) => {
      if (Array.isArray(r)) setStaff(r);
      else setError(r.error);
    });
  }, []);

  function submit() {
    const n = Number(counted);
    if (!to) return setError("اختر من يستلم الدرج");
    if (!Number.isFinite(n) || n < 0 || counted === "") return setError("أدخل المبلغ المعدود");
    setError(null);
    start(async () => {
      const r = await startHandoverAction(to, n);
      if (!r.ok) return setError(r.error);
      setDone(true);
    });
  }

  if (done) {
    return (
      <Modal title="بانتظار الاستلام" onClose={() => { onClose(); router.refresh(); }}>
        <div className="rounded-2xl bg-accent/10 p-4 text-center text-accentdeep">
          سُجّل التسليم. تنتقل مسؤولية الدرج عند تأكيد المُستلِم من جهازه.
        </div>
        <button onClick={() => { onClose(); router.refresh(); }} className="btn-primary mt-4 w-full py-3">
          تم
        </button>
      </Modal>
    );
  }

  return (
    <Modal title="تسليم الدرج" onClose={onClose}>
      <p className="mb-3 text-sm text-muted">
        اعدد النقد وأدخل المجموع. (لا تظهر لك الأرقام المتوقّعة — العدّ أعمى.)
      </p>

      <label className="mb-1.5 block text-sm font-semibold text-ink">المُستلِم</label>
      <select className="field mb-3" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">— اختر —</option>
        {staff.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      <label className="mb-1.5 block text-sm font-semibold text-ink">المبلغ المعدود</label>
      <input
        type="number"
        inputMode="numeric"
        dir="ltr"
        className="field nums mb-3 text-center text-lg"
        value={counted}
        onChange={(e) => {
          setCounted(e.target.value);
          setError(null);
        }}
      />

      {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
      <button onClick={submit} disabled={pending} className="btn-primary w-full">
        {pending ? "…" : "تسليم"}
      </button>
    </Modal>
  );
}

/** شريط يظهر للمُستلِم حتى يؤكّد — المسؤولية لا تنتقل بلا تأكيده. */
export function HandoverInbox({
  handoverId,
  fromName,
}: {
  handoverId: string;
  fromName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-4 py-3" dir="rtl">
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-amber-900">
          {fromName} سلّمك الدرج — أكّد الاستلام لتنتقل المسؤولية إليك.
        </span>
        <button
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await confirmHandoverAction(handoverId);
              if (!r.ok) return setError(r.error);
              router.refresh();
            })
          }
          className="btn-primary px-5 py-2 text-sm"
        >
          {pending ? "…" : "تأكيد الاستلام"}
        </button>
      </div>
      {error && <p className="mt-1 text-center text-sm text-red-600">{error}</p>}
    </div>
  );
}
