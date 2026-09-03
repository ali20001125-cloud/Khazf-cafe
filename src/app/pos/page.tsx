import PosScreen from "@/components/PosScreen";
import { db } from "@/lib/supabase";
import { getSettings, num, str } from "@/lib/settings";
import type { Drink } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PosPage() {
  const [{ data: drinks, error }, settings] = await Promise.all([
    db
      .from("drinks")
      .select("id, name, category, price, loyalty_eligible, crop_material_id, sort_order, active")
      .eq("active", true)
      .order("sort_order", { ascending: true }),
    getSettings(),
  ]);

  if (error) {
    return (
      <main className="p-6">
        <div className="card p-6 max-w-lg mx-auto text-center">
          <h1 className="text-xl font-bold mb-2">تعذّر الاتصال بقاعدة البيانات</h1>
          <p className="text-sm text-ink/70">
            راجع متغيّرات Supabase في <code>.env.local</code>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <PosScreen
      drinks={(drinks ?? []) as Drink[]}
      currency={str(settings, "currency", "د.ع")}
      shopName={str(settings, "shop_name", "مقهى خزف")}
      shopPhone={str(settings, "shop_phone", "")}
      extraShotPrice={num(settings, "extra_shot_price", 500)}
    />
  );
}
