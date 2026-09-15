"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StaffHoursRow, ShiftHoursRow } from "@/lib/hours";

/**
 * الدوام.
 *
 * ثلاثة أعمدة لا عمود واحد: عاديّ · إضافيّ يُدفع · إضافيّ لا يُدفع. ونظامٌ
 * يجمعها كلّها في رقمٍ واحد يجعل المالك يدفع على البقاء لا على العمل،
 * ونظامٌ يحذف ما لا يُثبَت يجعله يظلم من عمل ولم يبع. فالثلاثة تُعرض.
 */

function hm(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} د`;
  if (r === 0) return `${h} س`;
  return `${h} س ${r} د`;
}

function hourAr(h: number) {
  const n = Math.round(Number(h) || 0);
  if (n === 24 || n === 0) return "١٢ منتصف الليل";
  if (n > 24) return `${n - 24} فجراً`;
  if (n === 12) return "١٢ ظهراً";
  return n > 12 ? `${n - 12} مساءً` : `${n} صباحاً`;
}

function clock(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-GB", {
    timeZone: "Asia/Baghdad", hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

export default function HoursView({
  from, to, staff, shifts, startHour, endHour, minOrders,
}: {
  from: string;
  to: string;
  staff: StaffHoursRow[];
  shifts: ShiftHoursRow[];
  startHour: number;
  endHour: number;
  minOrders: number;
}) {
  const router = useRouter();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const [openRows, setOpenRows] = useState(false);

  const totalPaid = staff.reduce((a, r) => a + r.paid_overtime_minutes, 0);
  const totalUnpaid = staff.reduce((a, r) => a + r.unpaid_overtime_minutes, 0);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">الدوام</h1>
        <p className="mt-1 text-sm text-muted">
          الدوام الرسمي {hourAr(startHour)} ← {hourAr(endHour)}. ما بعده إضافيّ،
          ويُحتسب أجراً إذا رافقته{" "}
          {minOrders === 0 ? "بلا شرط فواتير" : `${minOrders} فاتورة على الأقل`}.
        </p>
      </div>

      <form
        className="card flex flex-wrap items-end gap-3 p-4"
        onSubmit={(e) => { e.preventDefault(); router.push(`/manage/hours?from=${f}&to=${t}`); }}
      >
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink">من</span>
          <input type="date" dir="ltr" className="field nums" value={f} onChange={(e) => setF(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-ink">إلى</span>
          <input type="date" dir="ltr" className="field nums" value={t} onChange={(e) => setT(e.target.value)} />
        </label>
        <button className="btn-primary px-5 py-2.5 text-sm">عرض</button>
      </form>

      {staff.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="font-display font-bold text-ink">لا ورديات مغلقة في هذه المدّة</p>
          <p className="mt-1 text-sm text-muted">الوردية تُحسب بعد إغلاقها.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-sm">
              <thead className="bg-sand text-right">
                <tr className="text-xs text-muted">
                  <th className="p-3 font-semibold">الموظف</th>
                  <th className="p-3 font-semibold">ورديات</th>
                  <th className="p-3 font-semibold">الدوام</th>
                  <th className="p-3 font-semibold">إضافيّ يُدفع</th>
                  <th className="p-3 font-semibold">إضافيّ لا يُدفع</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {staff.map((r) => (
                  <tr key={r.employee_id}>
                    <td className="p-3 font-semibold text-ink">{r.employee_name}</td>
                    <td className="nums p-3 text-muted">{r.shifts}</td>
                    <td className="nums p-3 text-ink">{hm(r.regular_minutes)}</td>
                    <td className="nums p-3 font-semibold text-emerald-700">
                      {r.paid_overtime_minutes > 0 ? hm(r.paid_overtime_minutes) : "—"}
                    </td>
                    <td className="nums p-3 text-amber-700">
                      {r.unpaid_overtime_minutes > 0 ? hm(r.unpaid_overtime_minutes) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalUnpaid > 0 && (
            <div className="card border-r-4 border-amber-400 p-4">
              <p className="font-display font-bold text-ink">
                {hm(totalUnpaid)} بعد الدوام بلا فاتورة واحدة
              </p>
              <p className="mt-1 text-sm text-muted">
                النظام لا يتّهم أحداً — قد يكون تنظيفاً أو تحضيراً للغد. لكنه لا
                يحتسبه أجراً تلقائياً، والقرار لك. (والمحتسَب فعلاً {hm(totalPaid)}).
              </p>
            </div>
          )}

          <button
            onClick={() => setOpenRows((v) => !v)}
            className="btn-ghost w-full py-3 text-sm"
          >
            {openRows ? "إخفاء الورديات" : `عرض الورديات واحدةً واحدة (${shifts.length})`}
          </button>

          {openRows && (
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead className="bg-sand text-right">
                  <tr className="text-xs text-muted">
                    <th className="p-3 font-semibold">اليوم</th>
                    <th className="p-3 font-semibold">الموظف</th>
                    <th className="p-3 font-semibold">من</th>
                    <th className="p-3 font-semibold">إلى</th>
                    <th className="p-3 font-semibold">الدوام</th>
                    <th className="p-3 font-semibold">إضافيّ</th>
                    <th className="p-3 font-semibold">فواتيره</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {shifts.map((r) => {
                    const proven = r.overtime_orders >= minOrders;
                    return (
                      <tr key={r.shift_id}>
                        <td className="nums p-3 text-muted">{r.business_day}</td>
                        <td className="p-3 text-ink">{r.employee_name}</td>
                        <td className="nums p-3 text-muted">
                          {clock(r.opened_at)}
                          {r.early_minutes > 0 && (
                            <span className="mr-1 text-[11px] text-amber-700">
                              (قبل الدوام {hm(r.early_minutes)})
                            </span>
                          )}
                        </td>
                        <td className="nums p-3 text-muted">{clock(r.closed_at)}</td>
                        <td className="nums p-3 text-ink">{hm(r.regular_minutes)}</td>
                        <td className={`nums p-3 ${r.overtime_minutes === 0 ? "text-muted" : proven ? "text-emerald-700" : "text-amber-700"}`}>
                          {r.overtime_minutes > 0 ? hm(r.overtime_minutes) : "—"}
                        </td>
                        <td className="nums p-3 text-muted">
                          {r.overtime_minutes > 0 ? r.overtime_orders : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
