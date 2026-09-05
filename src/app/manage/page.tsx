import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ManageHub() {
  const cards = [
    { href: "/manage/today", title: "لمحة اليوم", desc: "الإيراد · الشاذّ · الفروقات · إغلاق اليوم" },
    { href: "/manage/inventory", title: "المخزون", desc: "الأرصدة · إضافة مخزون · جرد وفرق" },
    { href: "/pos", title: "شاشة البيع", desc: "الكاشير" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <Link
          key={c.href}
          href={c.href}
          className="rounded-xl border border-line bg-cream p-5 shadow-sm active:scale-[0.99]"
        >
          <div className="text-lg font-semibold text-ink">{c.title}</div>
          <div className="mt-1 text-sm text-muted">{c.desc}</div>
        </Link>
      ))}
    </div>
  );
}
