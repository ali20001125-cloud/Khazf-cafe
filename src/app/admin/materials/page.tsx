import { db } from "@/lib/db";
import { unitLabel } from "@/lib/format";
import type { Material } from "@/lib/types";
import { saveMaterial, toggleMaterial } from "../actions";

export const dynamic = "force-dynamic";

const UNITS: { v: string; label: string }[] = [
  { v: "gram", label: "غرام" },
  { v: "ml", label: "مل" },
  { v: "piece", label: "حبة" },
];

export default async function MaterialsPage() {
  const materials = (await db()`
    select id, name, unit, stock::float8 as stock, low_alert::float8 as low_alert,
           is_coffee, active
      from materials
     order by name
  `) as unknown as Material[];

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="font-bold mb-3">إضافة مادة</h2>
        <form action={saveMaterial} className="grid grid-cols-2 sm:grid-cols-5 gap-3 items-end">
          <label className="col-span-2 sm:col-span-1">
            <span className="text-sm text-ink/60">الاسم</span>
            <input name="name" className="input mt-1" required />
          </label>
          <label>
            <span className="text-sm text-ink/60">الوحدة</span>
            <select name="unit" className="input mt-1">
              {UNITS.map((u) => (
                <option key={u.v} value={u.v}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="text-sm text-ink/60">المخزون</span>
            <input name="stock" type="number" step="0.001" defaultValue={0} className="input mt-1" />
          </label>
          <label>
            <span className="text-sm text-ink/60">حد التنبيه</span>
            <input name="low_alert" type="number" step="0.001" defaultValue={0} className="input mt-1" />
          </label>
          <button className="btn-primary">إضافة</button>
        </form>
      </section>

      <section className="space-y-2">
        {materials.map((m) => (
          <div key={m.id} className={`card p-3 ${m.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-end gap-3">
              <form action={saveMaterial} className="flex flex-wrap items-end gap-3 flex-1">
                <input type="hidden" name="id" value={m.id} />
                <label className="min-w-40 flex-1">
                  <span className="text-sm text-ink/60">الاسم</span>
                  <input name="name" defaultValue={m.name} className="input mt-1" />
                </label>
                <label className="w-28">
                  <span className="text-sm text-ink/60">الوحدة</span>
                  <select name="unit" defaultValue={m.unit} className="input mt-1">
                    {UNITS.map((u) => (
                      <option key={u.v} value={u.v}>
                        {u.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-32">
                  <span className="text-sm text-ink/60">المخزون ({unitLabel(m.unit)})</span>
                  <input name="stock" type="number" step="0.001" defaultValue={m.stock} className="input mt-1" />
                </label>
                <label className="w-32">
                  <span className="text-sm text-ink/60">حد التنبيه</span>
                  <input name="low_alert" type="number" step="0.001" defaultValue={m.low_alert} className="input mt-1" />
                </label>
                <label className="flex items-center gap-1 text-sm pb-3">
                  <input type="checkbox" name="is_coffee" defaultChecked={m.is_coffee} />
                  حبوب
                </label>
                <button className="btn text-sm">حفظ</button>
              </form>
              <form action={toggleMaterial}>
                <input type="hidden" name="id" value={m.id} />
                <input type="hidden" name="active" value={String(m.active)} />
                <button className="btn text-sm text-red-700">{m.active ? "تعطيل" : "تفعيل"}</button>
              </form>
            </div>
            {m.stock <= m.low_alert && (
              <p className="text-xs text-red-700 mt-2">تحت حد التنبيه</p>
            )}
          </div>
        ))}
      </section>
    </div>
  );
}
