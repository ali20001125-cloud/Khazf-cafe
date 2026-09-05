"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { closeDayAction } from "@/app/manage/day-actions";

export default function DayCloseButton({ closed }: { closed: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (closed) {
    return (
      <span className="rounded-lg bg-neutral-100 px-4 py-2 text-sm text-neutral-500">اليوم مغلق</span>
    );
  }

  function confirm() {
    if (pending) return;
    start(async () => {
      const res = await closeDayAction();
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        onClick={() => { setOpen(true); setError(null); }}
        className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-[#5b4636]"
      >
        إغلاق اليوم
      </button>
      {open && (
        <Modal title="إغلاق اليوم" onClose={() => setOpen(false)}>
          <p className="mb-4 text-sm text-neutral-500">
            سيُثبَّت اليوم المحاسبي بمجاميعه. تأكّد أن كل الورديات مُغلقة.
          </p>
          {error && <div className="mb-3 text-center text-sm text-red-600">{error}</div>}
          <button
            onClick={confirm}
            disabled={pending}
            className="w-full rounded-xl bg-[#8a6a4f] py-3 text-base font-semibold text-white disabled:opacity-50"
          >
            {pending ? "..." : "تأكيد الإغلاق"}
          </button>
        </Modal>
      )}
    </>
  );
}
