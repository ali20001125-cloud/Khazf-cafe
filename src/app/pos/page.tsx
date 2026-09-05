import PosScreen from "@/components/PosScreen";
import { db } from "@/lib/db";
import { getSettings, num, str } from "@/lib/settings";
import type { Drink } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  let drinks: Drink[];
  try {
    drinks = (await db()`
      select id, name, category, price, loyalty_eligible, crop_material_id, sort_order, active
        from drinks
       where active
       order by sort_order
    `) as unknown as Drink[];
  } catch {
    return (
      <main className="p-6">
        <div className="card p-6 max-w-lg mx-auto text-center">
          <h1 className="text-xl font-bold mb-2">تعذّر الاتصال بقاعدة البيانات</h1>
          <p className="text-sm text-ink/70">
            راجع <code>DATABASE_URL</code> في <code>.env.local</code>.
          </p>
        </div>
      </main>
    );
  }

  const settings = await getSettings();

  return (
    <PosScreen
      drinks={drinks}
      currency={str(settings, "currency", "د.ع")}
      shopName={str(settings, "shop_name", "مقهى خزف")}
      shopPhone={str(settings, "shop_phone", "")}
      extraShotPrice={num(settings, "extra_shot_price", 500)}
    />
  );
}
