import Link from "next/link";
import { db } from "@/lib/db";
import { unitLabel } from "@/lib/format";
import type { Material } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  let materials: Material[] = [];
  let drinkCount = 0;
  let offline = false;

  try {
    materials = (await db()`
      select id, name, unit, stock::float8 as stock, low_alert::float8 as low_alert,
             is_coffee, active
        from materials
       where active
       order by name
    `) as unknown as Material[];
    const rows = (await db()`
      select count(*)::int as n from drinks where active
    `) as unknown as { n: number }[];
    drinkCount = rows[0]?.n ?? 0;
  } catch {
    offline = true;
  }

  if (offline) {
    return (
      <div className="card p-6 text-center">
        <h1 className="font-bold mb-2">تعذّر الاتصال بقاعدة البيانات</h1>
        <p className="text-sm text-ink/70">
          راجع <code>DATABASE_URL</code>.
        </p>
      </div>
    );
  }

  const low = materials.filter((m) => m.stock <= m.low_alert);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Stat label="مشروبات مفعّلة" value={String(drinkCount)} />
        <Stat label="مواد مفعّلة" value={String(materials.length)} />
        <Stat label="مواد تحت الحد" value={String(low.length)} tone={low.length ? "warn" : "ok"} />
      </div>

      {low.length > 0 && (
        <section className="card p-4">
          <h2 className="font-bold mb-3">مواد قاربت النفاد</h2>
          <ul className="space-y-1 text-sm">
            {low.map((m) => (
              <li key={m.id} className="flex justify-between">
                <span>{m.name}</span>
                <span className="tabular-nums text-red-700">
                  {m.stock} {unitLabel(m.unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-4">
        <h2 className="font-bold mb-2">المرحلة ١</h2>
        <p className="text-sm text-ink/70 leading-7">
          المشروبات والمواد والوصفات وشاشة البيع والدفع والطباعة جاهزة. المخزون ينقص تلقائياً عند كل بيع
          مدفوع حسب الوصفة. المراحل القادمة: الجرد والفرق، ثم الموظفين والورديات والتقرير الاستثنائي، ثم الولاء.
        </p>
        <div className="flex gap-2 mt-3 flex-wrap">
          <Link href="/admin/materials" className="btn text-sm">
            إدارة المواد
          </Link>
          <Link href="/admin/drinks" className="btn text-sm">
            إدارة المشروبات والوصفات
          </Link>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "warn" }) {
  return (
    <div className="card p-4">
      <div className="text-sm text-ink/60">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${tone === "warn" ? "text-red-700" : ""}`}>{value}</div>
    </div>
  );
}
