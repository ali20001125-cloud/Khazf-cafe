"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPosLockAction } from "@/app/manage/lock-actions";

export default function LockToggle({ locked }: { locked: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    if (pending) return;
    start(async () => {
      const res = await setPosLockAction(!locked);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  return (
    <div className="flex flex-col items-end">
      <button
        onClick={toggle}
        disabled={pending}
        className={`rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 ${
          locked ? "bg-red-600 text-white" : "border border-neutral-200 bg-white text-[#5b4636]"
        }`}
      >
        {pending ? "..." : locked ? "الكاشير مقفل — افتح" : "قفل الكاشير"}
      </button>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
