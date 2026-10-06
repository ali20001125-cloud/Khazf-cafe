"use client";

/** زرّ الطباعة — `window.print()` لا يُستدعى من صفحةٍ خادمية. */
export default function PrintButton({ label }: { label: string }) {
  return (
    <button type="button" onClick={() => window.print()} className="pm-btn">
      {label}
    </button>
  );
}
