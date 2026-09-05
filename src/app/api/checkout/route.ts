import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import type { PaymentMethod, ServiceType } from "@/lib/types";

export const dynamic = "force-dynamic";

type IncomingItem = {
  drink_id?: unknown;
  qty?: unknown;
  service?: unknown;
  extra_shots?: unknown;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "طلب غير صالح" }, { status: 400 });
  }

  const { items, payment_method, cash_received } = (body ?? {}) as {
    items?: IncomingItem[];
    payment_method?: unknown;
    cash_received?: unknown;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "السلة فارغة" }, { status: 400 });
  }
  if (items.length > 50) {
    return NextResponse.json({ error: "عدد البنود كبير" }, { status: 400 });
  }
  if (payment_method !== "cash" && payment_method !== "card") {
    return NextResponse.json({ error: "طريقة دفع غير معروفة" }, { status: 400 });
  }

  // تنظيف المدخلات. الأسعار تُحسب داخل قاعدة البيانات، لا من هنا.
  const clean = [];
  for (const it of items) {
    const id = typeof it.drink_id === "string" ? it.drink_id : "";
    if (!UUID.test(id)) {
      return NextResponse.json({ error: "معرّف مشروب غير صالح" }, { status: 400 });
    }
    const qty = Math.min(99, Math.max(1, Math.floor(Number(it.qty) || 1)));
    const shots = Math.min(9, Math.max(0, Math.floor(Number(it.extra_shots) || 0)));
    const service: ServiceType = it.service === "dinein" ? "dinein" : "takeaway";
    clean.push({ drink_id: id, qty, extra_shots: shots, service });
  }

  const method = payment_method as PaymentMethod;
  let cash: number | null = null;
  if (method === "cash") {
    cash = Math.floor(Number(cash_received) || 0);
    if (cash <= 0) {
      return NextResponse.json({ error: "أدخل المبلغ المستلم" }, { status: 400 });
    }
  }

  let row: { order_id: string; order_number: string; total: number; change_due: number | null };
  try {
    const rows = (await db()`
      select order_id, order_number, total, change_due
        from checkout(
          ${JSON.stringify(clean)}::jsonb,
          ${method}::payment_method,
          ${cash}::integer,
          'takeaway'::service_type,
          null::uuid,
          null::uuid
        )
    `) as unknown as typeof row[];
    if (!rows[0]) {
      return NextResponse.json({ error: "لم تُسجَّل الفاتورة" }, { status: 500 });
    }
    row = rows[0];
  } catch (e) {
    // رسائل الدالة عربية ومقصودة للباريستا (سلة فارغة، مبلغ ناقص، مشروب غير مفعّل)
    const msg = e instanceof Error ? e.message : "فشل إتمام البيع";
    console.error("[checkout]", msg);
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({
    order_id: row.order_id,
    order_number: Number(row.order_number),
    total: Number(row.total),
    change_due: row.change_due === null ? null : Number(row.change_due),
  });
}
