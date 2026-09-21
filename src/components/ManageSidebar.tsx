"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const NAV = [
  { href: "/", label: "الرئيسية" },
  { href: "/manage", label: "نظرة عامة" },
  { href: "/manage/orders", label: "الطلبات" },
  { href: "/manage/profit", label: "الأرباح" },
  { href: "/manage/sales", label: "مبيعات المشروبات" },
  { href: "/manage/inventory", label: "المخزون" },
  { href: "/manage/shopping", label: "قائمة الشراء" },
  { href: "/manage/products", label: "المشروبات والوصفات" },
  { href: "/manage/prices", label: "الأسعار" },
  { href: "/manage/menu", label: "المنيو" },
  { href: "/manage/loyalty", label: "الولاء" },
  { href: "/manage/exceptions", label: "الشاذّ" },
  { href: "/manage/users", label: "الموظفون والرموز" },
  { href: "/manage/hours", label: "الدوام" },
  { href: "/manage/settings", label: "الإعدادات" },
  { href: "/pos", label: "شاشة البيع" },
];

export default function ManageSidebar({ userName }: { userName: string }) {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  const links = (
    <nav className="space-y-1">
      {NAV.map((n) => {
        const active = n.href === "/" || n.href === "/manage" ? path === n.href : path.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={() => setOpen(false)}
            className={`block rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
              active ? "bg-cream/15 text-cream" : "text-cream/60 hover:bg-cream/10 hover:text-cream"
            }`}
          >
            {n.href === "/" ? `→ ${n.label}` : n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* رأس الموبايل */}
      <div className="topbar flex items-center justify-between px-4 py-3 lg:hidden">
        <span className="font-display text-lg font-bold text-cream">خزف · الإدارة</span>
        {/*
          كانت `chip` فارتفعت ٢٦ بكسل — وهي المدخل الوحيد لكل شاشات
          الإدارة على الهاتف. هدفُ لمسٍ أصغر من ٤٤ يُخطئه الإبهام، وهذا
          الزرّ بالذات لا بديل عنه في الشاشة.
        */}
        <button
          onClick={() => setOpen(true)}
          aria-label="فتح القائمة"
          className="tap flex min-h-[44px] min-w-[44px] items-center gap-1.5 rounded-xl border border-cream/20 bg-cream/10 px-3 text-sm font-medium text-cream/90"
        >
          <span aria-hidden>☰</span> القائمة
        </button>
      </div>

      {/* شريط جانبي ثابت (سطح المكتب) */}
      <aside className="topbar hidden w-60 shrink-0 flex-col justify-between p-4 lg:flex">
        <div>
          <div className="mb-1 px-2 font-display text-2xl font-bold text-cream">خزف</div>
          <div className="mb-6 px-2 text-xs tracking-widest text-cream/40">الإدارة</div>
          {links}
        </div>
        <div className="px-2 text-xs text-cream/40">{userName} · المالك</div>
      </aside>

      {/* درج الموبايل */}
      {open && (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-dark/60 motion-safe:animate-[fadein_.2s_ease] lg:hidden"
          onClick={() => setOpen(false)}
        >
          {/* `overflow-hidden` على الغطاء: القائمة تبدأ خارج الشاشة،
              وبدونه يظهر شريطُ تمريرٍ أفقيّ لجزءٍ من ثانية. */}
          <aside
            className="topbar h-full w-64 p-4 motion-safe:animate-[slidein_.26s_cubic-bezier(0.22,0.68,0,1)]"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="font-display text-xl font-bold text-cream">خزف</span>
              <button onClick={() => setOpen(false)} className="text-cream/60">✕</button>
            </div>
            {links}
          </aside>
        </div>
      )}
    </>
  );
}
