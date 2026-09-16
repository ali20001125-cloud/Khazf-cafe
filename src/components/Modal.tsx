"use client";

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-dark/50 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-3xl bg-sand p-6 shadow-lift sm:rounded-3xl"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between">
          <h3 className="font-display text-lg font-bold text-ink">{title}</h3>
          {/*
            زرّ الإغلاق في كل نافذة في النظام. كان ٣٢ بكسل — وهو المخرج
            الوحيد لمن فتح نافذةً بالخطأ، فتصغيره يحبس المستخدم فيها.
            والدائرة الملوّنة تبقى ٣٢ ليبقى الشكل، ومساحة اللمس ٤٤.
          */}
          <button
            onClick={onClose}
            aria-label="إغلاق"
            className="tap -m-1.5 flex h-11 w-11 items-center justify-center p-1.5"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-dark/5 text-muted">
              ✕
            </span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
