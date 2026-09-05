import Link from "next/link";

export const dynamic = "force-dynamic";

export default function ManageHub() {
  const cards = [
    { href: "/manage/today", title: "لمحة اليوم", desc: "الإيراد · الشاذّ · الفروقات · إغلاق اليوم" },
    { href: "/manage/products", title: "المشروبات والأسعار", desc: "الأسعار · الوصفات · إيقاف مشروب" },
    { href: "/manage/inventory", title: "المخزون", desc: "الأرصدة · إضافة مخزون · جرد وفرق" },
    { href: "/manage/settings", title: "الإعدادات", desc: "اسم المحل · الفكّة · الحدود · العتبات" },
    { href: "/pos", title: "شاشة البيع", desc: "الكاشير" },
  ];
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((c) => (
        <Link key={c.href} href={c.href} className="card p-5 tap hover:border-accent/40">
          <div className="font-display text-lg font-bold text-ink">{c.title}</div>
          <div className="mt-1 text-sm text-muted">{c.desc}</div>
        </Link>
      ))}
    </div>
  );
}
