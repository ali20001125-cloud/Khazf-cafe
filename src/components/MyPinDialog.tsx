"use client";

import { useState, useTransition } from "react";
import Modal from "@/components/Modal";
import { changeMyPinAction } from "@/app/manage/users-actions";

/**
 * «غيّر رمزي» — يستخدمها المالك من شاشة الموظفين والباريستا من الكاشير.
 * الباريستا يحتاجها تحديداً: رمزه الابتدائي 0000، ولوحة الإدارة مقفلة عليه،
 * فلو لم يكن الزرّ في شاشته لبقي على الرمز الافتراضي إلى الأبد.
 */
export default function MyPinDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: () => void;
}) {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (next !== again) return setError("الرمزان الجديدان غير متطابقين");
    setError(null);
    start(async () => {
      const r = await changeMyPinAction(cur, next);
      if (!r.ok) return setError(r.error);
      onDone();
    });
  }

  return (
    <Modal title="تغيير رمزي" onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">
          رمزك هو ما يُثبت أنك أنت: كل فاتورة ووردية وحركة درج تُنسب إليه.
          اجعله معروفاً لك وحدك — ولا تكتبه على ورقة قرب الكاشير.
        </p>
        <Pin label="رمزي الحالي" value={cur} onChange={setCur} />
        <Pin label="الرمز الجديد" value={next} onChange={setNext} hint="٤ إلى ٨ أرقام" />
        <Pin label="أعِد الرمز الجديد" value={again} onChange={setAgain} />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-ghost py-3">
            إلغاء
          </button>
          <button
            onClick={submit}
            disabled={pending || !cur || !next || !again}
            className="btn-primary py-3 disabled:opacity-40"
          >
            {pending ? "…" : "تغيير"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function Pin({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const id = `mypin-${label.replace(/\s/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        className="field nums text-center text-xl tracking-[0.3em]"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}
