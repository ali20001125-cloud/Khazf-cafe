import Link from "next/link";
import { db } from "@/lib/supabase";
import { categoryLabel, money } from "@/lib/format";
import type { Drink, Material } from "@/lib/types";
import { saveDrink, toggleDrink } from "../actions";

export const dynamic = "force-dynamic";

const CATS = [
  { v: "hot", label: "ساخن" },
  { v: "cold", label: "بارد" },
  { v: "espresso", label: "إسبريسو" },
  { v: "other", label: "مختص" },
];

export default async function DrinksPage() {
  const [{ data: drinkRows }, { data: matRows }] = await Promise.all([
    db.from("drinks").select("*").order("sort_order"),
    db.from("materials").select("*").eq("is_coffee", true).eq("active", true).order("name"),
  ]);
  const drinks = (drinkRows ?? []) as Drink[];
  const crops = (matRows ?? []) as Material[];

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <h2 className="font-bold mb-3">إضافة مشروب</h2>
        <form action={saveDrink} className="flex flex-wrap items-end gap-3">
          <label className="min-w-40 flex-1">
            <span className="text-sm text-ink/60">الاسم</span>
            <input name="name" className="input mt-1" required />
          </label>
          <label className="w-32">
            <span className="text-sm text-ink/60">الفئة</span>
            <select name="category" className="input mt-1">
              {CATS.map((c) => (
                <option key={c.v} value={c.v}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="w-32">
            <span className="text-sm text-ink/60">السعر</span>
            <input name="price" type="number" min={0} defaultValue={0} className="input mt-1" />
          </label>
          <label className="w-40">
            <span className="text-sm text-ink/60">المحصول</span>
            <select name="crop_material_id" className="input mt-1">
              <option value="">—</option>
              {crops.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="w-24">
            <span className="text-sm text-ink/60">الترتيب</span>
            <input name="sort_order" type="number" defaultValue={100} className="input mt-1" />
          </label>
          <label className="flex items-center gap-1 text-sm pb-3">
            <input type="checkbox" name="loyalty_eligible" defaultChecked />
            يعطي ختماً
          </label>
          <button className="btn-primary">إضافة</button>
        </form>
      </section>

      <section className="space-y-2">
        {drinks.map((d) => (
          <div key={d.id} className={`card p-3 ${d.active ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-end gap-3">
              <form action={saveDrink} className="flex flex-wrap items-end gap-3 flex-1">
                <input type="hidden" name="id" value={d.id} />
                <label className="min-w-36 flex-1">
                  <span className="text-sm text-ink/60">الاسم</span>
                  <input name="name" defaultValue={d.name} className="input mt-1" />
                </label>
                <label className="w-28">
                  <span className="text-sm text-ink/60">الفئة</span>
                  <select name="category" defaultValue={d.category} className="input mt-1">
                    {CATS.map((c) => (
                      <option key={c.v} value={c.v}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-28">
                  <span className="text-sm text-ink/60">السعر</span>
                  <input name="price" type="number" min={0} defaultValue={d.price} className="input mt-1" />
                </label>
                <label className="w-36">
                  <span className="text-sm text-ink/60">المحصول</span>
                  <select name="crop_material_id" defaultValue={d.crop_material_id ?? ""} className="input mt-1">
                    <option value="">—</option>
                    {crops.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="w-20">
                  <span className="text-sm text-ink/60">ترتيب</span>
                  <input name="sort_order" type="number" defaultValue={d.sort_order} className="input mt-1" />
                </label>
                <label className="flex items-center gap-1 text-sm pb-3">
                  <input type="checkbox" name="loyalty_eligible" defaultChecked={d.loyalty_eligible} />
                  ختم
                </label>
                <button className="btn text-sm">حفظ</button>
              </form>
              <Link href={`/admin/drinks/${d.id}`} className="btn text-sm">
                الوصفة
              </Link>
              <form action={toggleDrink}>
                <input type="hidden" name="id" value={d.id} />
                <input type="hidden" name="active" value={String(d.active)} />
                <button className="btn text-sm text-red-700">{d.active ? "تعطيل" : "تفعيل"}</button>
              </form>
            </div>
            <p className="text-xs text-ink/50 mt-2">
              {categoryLabel(d.category)} · {money(d.price)} {d.loyalty_eligible ? "" : "· مستثنى من الولاء"}
            </p>
          </div>
        ))}
      </section>
    </div>
  );
}
