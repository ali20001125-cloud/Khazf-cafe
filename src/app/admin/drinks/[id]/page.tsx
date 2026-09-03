import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { unitLabel } from "@/lib/format";
import type { Drink, Material, RecipeRow } from "@/lib/types";
import { deleteRecipeRow, saveRecipeRow } from "../../actions";

export const dynamic = "force-dynamic";

export default async function RecipePage({ params }: { params: { id: string } }) {
  const [{ data: drink }, { data: matRows }, { data: recipeRows }] = await Promise.all([
    db.from("drinks").select("*").eq("id", params.id).maybeSingle(),
    db.from("materials").select("*").eq("active", true).order("name"),
    db.from("drink_materials").select("*").eq("drink_id", params.id),
  ]);

  if (!drink) notFound();

  const d = drink as Drink;
  const materials = (matRows ?? []) as Material[];
  const recipe = (recipeRows ?? []) as RecipeRow[];
  const byId = new Map(materials.map((m) => [m.id, m]));
  const used = new Set(recipe.map((r) => r.material_id));
  const available = materials.filter((m) => !used.has(m.id));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="font-bold text-lg ml-auto">وصفة: {d.name}</h1>
        <Link href="/admin/drinks" className="btn text-sm">
          رجوع
        </Link>
      </div>

      <p className="text-sm text-ink/60 leading-7">
        كل بيع مدفوع ينقص هذه الكميات من المخزون. المواد المعلَّمة «للسفري فقط» (الكوب والغطاء) لا تُخصم عند
        طلب الجلوس.
      </p>

      <section className="space-y-2">
        {recipe.length === 0 && <p className="card p-4 text-center text-ink/50">لا مواد في الوصفة بعد</p>}
        {recipe.map((r) => {
          const m = byId.get(r.material_id);
          return (
            <div key={r.material_id} className="card p-3 flex flex-wrap items-end gap-3">
              <form action={saveRecipeRow} className="flex flex-wrap items-end gap-3 flex-1">
                <input type="hidden" name="drink_id" value={d.id} />
                <input type="hidden" name="material_id" value={r.material_id} />
                <div className="min-w-36 flex-1">
                  <span className="text-sm text-ink/60">المادة</span>
                  <div className="font-bold mt-1">{m?.name ?? "—"}</div>
                </div>
                <label className="w-36">
                  <span className="text-sm text-ink/60">الكمية ({m ? unitLabel(m.unit) : ""})</span>
                  <input name="qty" type="number" step="0.001" min="0.001" defaultValue={r.qty} className="input mt-1" />
                </label>
                <label className="flex items-center gap-1 text-sm pb-3">
                  <input type="checkbox" name="takeaway_only" defaultChecked={r.takeaway_only} />
                  للسفري فقط
                </label>
                <button className="btn text-sm">حفظ</button>
              </form>
              <form action={deleteRecipeRow}>
                <input type="hidden" name="drink_id" value={d.id} />
                <input type="hidden" name="material_id" value={r.material_id} />
                <button className="btn text-sm text-red-700">حذف</button>
              </form>
            </div>
          );
        })}
      </section>

      {available.length > 0 && (
        <section className="card p-4">
          <h2 className="font-bold mb-3">إضافة مادة للوصفة</h2>
          <form action={saveRecipeRow} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="drink_id" value={d.id} />
            <label className="min-w-40 flex-1">
              <span className="text-sm text-ink/60">المادة</span>
              <select name="material_id" className="input mt-1">
                {available.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({unitLabel(m.unit)})
                  </option>
                ))}
              </select>
            </label>
            <label className="w-36">
              <span className="text-sm text-ink/60">الكمية</span>
              <input name="qty" type="number" step="0.001" min="0.001" className="input mt-1" required />
            </label>
            <label className="flex items-center gap-1 text-sm pb-3">
              <input type="checkbox" name="takeaway_only" />
              للسفري فقط
            </label>
            <button className="btn-primary">إضافة</button>
          </form>
        </section>
      )}
    </div>
  );
}
