"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { money } from "@/lib/format";
import { updateSettingsAction } from "@/app/manage/settings-actions";
import { updateBranchAction } from "@/app/manage/branch-actions";

/**
 * الإعدادات.
 *
 * كل حقل هنا يشرح **ماذا يفعل ولماذا يهمّ**، لا اسمه فقط. المالك مبتدئ في
 * تشغيل مقهى، و«عتبة الفروقات ٣٪» بلا شرح رقم لا يعني له شيئاً.
 *
 * مقسومة قسمين لأن لكل إعداد بيتاً واحداً (هجرة 0019):
 * ما يخصّ الفرع على `branches`، وما يخصّ العمل في `settings`.
 */

type Shop = {
  shop_name: string;
  shop_phone: string;
  staff_drink_limit: number;
  session_timeout_minutes: number;
};

type Branch = {
  standard_float: number;
  day_start_hour: number;
  variance_threshold_pct: number;
  drawer_count_by: "barista" | "owner" | "none";
  shift_start_hour: number;
  shift_end_hour: number;
  overtime_min_orders: number;
};

export default function SettingsEditor({
  shop,
  branch,
  currency,
}: {
  shop: Shop;
  branch: Branch;
  currency: string;
}) {
  const router = useRouter();
  const [s, setS] = useState<Shop>(shop);
  const [b, setB] = useState<Branch>(branch);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save() {
    if (pending) return;
    setError(null);
    setSaved(false);
    start(async () => {
      const r1 = await updateSettingsAction({
        shop_name: s.shop_name,
        shop_phone: s.shop_phone,
        staff_drink_limit: Math.round(Number(s.staff_drink_limit) || 0),
        session_timeout_minutes: Math.round(Number(s.session_timeout_minutes) || 0),
      });
      if (!r1.ok) return setError(r1.error);

      const r2 = await updateBranchAction({
        standard_float: Math.round(Number(b.standard_float) || 0),
        day_start_hour: Math.round(Number(b.day_start_hour) || 0),
        variance_threshold_pct: Number(b.variance_threshold_pct) || 0,
        drawer_count_by: b.drawer_count_by,
        shift_start_hour: Math.round(Number(b.shift_start_hour) || 0),
        shift_end_hour: Math.round(Number(b.shift_end_hour) || 0),
        overtime_min_orders: Math.round(Number(b.overtime_min_orders) || 0),
      });
      if (!r2.ok) return setError(r2.error);

      setSaved(true);
      router.refresh();
    });
  }

  const hour = Math.max(0, Math.min(23, Math.round(Number(b.day_start_hour) || 0)));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted">
          هذه الأرقام يضعها المالك وحده، وتغييرها يُسجَّل في سجلّ التدقيق.
        </p>
      </div>

      {/* المحل */}
      <section className="card space-y-4 p-5">
        <h2 className="font-display font-bold text-ink">المحل</h2>
        <Field
          label="اسم المحل"
          hint="يظهر أعلى الفاتورة المطبوعة."
        >
          <input className="field" value={s.shop_name} onChange={(e) => { setS({ ...s, shop_name: e.target.value }); setSaved(false); }} />
        </Field>
        <Field label="هاتف المحل" hint="يظهر أسفل الفاتورة.">
          <input className="field nums" dir="ltr" value={s.shop_phone} onChange={(e) => { setS({ ...s, shop_phone: e.target.value }); setSaved(false); }} />
        </Field>
      </section>

      {/* الدرج واليوم */}
      <section className="card space-y-5 p-5">
        <h2 className="font-display font-bold text-ink">الدرج واليوم</h2>

        <Field
          label="الفكّة الافتتاحية"
          hint="المبلغ الذي تضعه في الدرج كل صباح ليعطي الباريستا باقي الزبائن. الباريستا لا يستطيع تغييره — يؤكّد وجوده فقط، لأن من يُحاسَب على الدرج لا يضع الرقم الذي يُقاس عليه."
        >
          <input
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="field nums text-lg"
            value={b.standard_float}
            onChange={(e) => { setB({ ...b, standard_float: Number(e.target.value) }); setSaved(false); }}
          />
          <p className="nums mt-1 text-xs text-accentdeep">{money(Number(b.standard_float) || 0, currency)}</p>
        </Field>

        <Field
          label="متى يبدأ يوم العمل؟"
          hint="لو أغلقت الوردية الساعة ١ فجراً، هل تُحسب مبيعاتها على أمس أم على اليوم؟ باختيار ٥ صباحاً تُحسب على أمس — حيث بدأت الوردية فعلاً. اختر ساعة لا يعمل فيها المقهى."
        >
          <select
            className="field"
            value={hour}
            onChange={(e) => { setB({ ...b, day_start_hour: Number(e.target.value) }); setSaved(false); }}
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h === 0 ? "منتصف الليل ١٢:٠٠" : h < 12 ? `${h}:٠٠ صباحاً` : h === 12 ? "١٢:٠٠ ظهراً" : `${h - 12}:٠٠ مساءً`}
              </option>
            ))}
          </select>
          <p className="mt-1.5 rounded-lg bg-sand px-3 py-2 text-xs text-muted">
            يوم العمل يمتدّ من{" "}
            <span className="nums font-semibold text-ink">{hour}:٠٠</span> حتى{" "}
            <span className="nums font-semibold text-ink">{hour}:٠٠</span> من الغد.
          </p>
        </Field>
      </section>

      {/* الدرج */}
      <section className="card space-y-4 p-5">
        <div>
          <h2 className="font-display font-bold text-ink">من يعدّ الدرج؟</h2>
          <p className="mt-1 text-sm text-muted">
            العدّ هو لحظة انتقال المسؤولية عن النقد. فإن لم يعدّه أحدٌ عند
            الإغلاق، ثم ظهر نقصٌ صباحاً، لم يُعرف متى وقع — ولا يُتّهم أحد ولا
            يُبرّأ أحد.
          </p>
        </div>

        <div className="space-y-2">
          <CountOption
            active={b.drawer_count_by === "owner"}
            onClick={() => { setB({ ...b, drawer_count_by: "owner" }); setSaved(false); }}
            title="أنا أعدّه"
            desc="الباريستا يُنهي ورديته ويطلع، والنقد يبقى في الدرج. يظهر لك بندٌ في اللوحة: «درج وردية فلان بانتظار عدّك»، فتعدّ وتُدخل الرقم متى شئت."
          />
          <CountOption
            active={b.drawer_count_by === "barista"}
            onClick={() => { setB({ ...b, drawer_count_by: "barista" }); setSaved(false); }}
            title="الباريستا يعدّه (أعمى)"
            desc="يعدّ النقد ويكتب المجموع، ولا يرى المتوقّع ولا الفرق ولا مبيعات اليوم. يخرج وهو لا يدري أزاد أم نقص — فالفرق يُكشف لحظة إغلاقه، لا صباح الغد."
          />
          <CountOption
            active={b.drawer_count_by === "none"}
            onClick={() => { setB({ ...b, drawer_count_by: "none" }); setSaved(false); }}
            title="لا أحد"
            desc="لا عدّ ولا فحص للدرج. النقص لا يُكتشف أصلاً، وتبقى الفواتير والمخزون وحدها ما يُراجَع."
            warn
          />
        </div>
      </section>

      {/* الدوام */}
      <section className="card space-y-5 p-5">
        <h2 className="font-display font-bold text-ink">الدوام والوقت الإضافي</h2>
        <p className="rounded-xl bg-sand p-3 text-xs text-muted">
          الدوام الرسمي من <span className="nums font-semibold text-ink">{hourAr(b.shift_start_hour)}</span>{" "}
          إلى <span className="nums font-semibold text-ink">{hourAr(b.shift_end_hour)}</span>. ما بعده
          يُحسب <span className="font-semibold text-ink">إضافيّاً</span>.
        </p>

        <div className="grid grid-cols-2 gap-3">
          <Field label="بداية الدوام" hint="بتوقيت الفرع.">
            <input
              type="number" inputMode="numeric" dir="ltr" className="field nums text-center"
              value={b.shift_start_hour}
              onChange={(e) => { setB({ ...b, shift_start_hour: Number(e.target.value) }); setSaved(false); }}
            />
          </Field>
          <Field label="نهاية الدوام" hint="٢٤ = منتصف الليل · ٢٦ = ٢ فجراً.">
            <input
              type="number" inputMode="numeric" dir="ltr" className="field nums text-center"
              value={b.shift_end_hour}
              onChange={(e) => { setB({ ...b, shift_end_hour: Number(e.target.value) }); setSaved(false); }}
            />
          </Field>
        </div>

        <Field
          label="كم فاتورة تُثبت الوقت الإضافي؟"
          hint="الوقت الإضافي يُدفع لأن عملاً جرى، لا لأن الموظف بقي. والفاتورة دليلٌ صعب التزوير: مالٌ دخل الدرج في تلك الدقيقة. صفر = يُحتسب دائماً بلا شرط."
        >
          <input
            type="number" inputMode="numeric" dir="ltr" className="field nums"
            value={b.overtime_min_orders}
            onChange={(e) => { setB({ ...b, overtime_min_orders: Number(e.target.value) }); setSaved(false); }}
          />
          <p className="mt-1.5 rounded-lg bg-sand px-3 py-2 text-xs text-muted">
            الدقائق التي لا تُثبتها فواتير <span className="font-semibold text-ink">تُعرض ولا تُخفى</span> —
            تظهر في «الدوام» تحت «لا يُدفع»، والقرار فيها لك.
          </p>
        </Field>
      </section>

      {/* التنبيهات */}
      <section className="card space-y-5 p-5">
        <h2 className="font-display font-bold text-ink">التنبيهات</h2>

        <Field
          label="عتبة تنبيه فرق الجرد (%)"
          hint="عند الجرد نقارن المعدود بالمتوقّع. فوق هذه النسبة يصير الفرق «أحمر» في اللوحة. ملاحظة مهمّة: هذه عتبة تنبيه فقط — ليست كمية هدر مسموحة، والفرق يُسجَّل كاملاً مهما صغر."
        >
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            dir="ltr"
            className="field nums"
            value={b.variance_threshold_pct}
            onChange={(e) => { setB({ ...b, variance_threshold_pct: Number(e.target.value) }); setSaved(false); }}
          />
          <p className="mt-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            حتى لو كان الفرق تحت العتبة، النظام يخبرك بمكافئه بالجرعات: نقص ١٨ غراماً =
            ٠٫٤٪ من ٥ كيلو، لكنه <span className="font-semibold">جرعة قهوة كاملة</span>.
          </p>
        </Field>

        <Field
          label="مشروبات الباريستا المجانية في الوردية"
          hint="عدد المشروبات التي يأخذها الباريستا لنفسه بلا موافقتك. فوقها يحتاج رمزك."
        >
          <input
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="field nums"
            value={s.staff_drink_limit}
            onChange={(e) => { setS({ ...s, staff_drink_limit: Number(e.target.value) }); setSaved(false); }}
          />
        </Field>

        <Field
          label="قفل الشاشة بعد خمول (دقائق)"
          hint="لو تُرك جهاز الكاشير مفتوحاً بلا استخدام، يُقفل تلقائياً حتى لا يستعمله أحد باسم الباريستا."
        >
          <input
            type="number"
            inputMode="numeric"
            dir="ltr"
            className="field nums"
            value={s.session_timeout_minutes}
            onChange={(e) => { setS({ ...s, session_timeout_minutes: Number(e.target.value) }); setSaved(false); }}
          />
        </Field>
      </section>

      {error && <div className="rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">{error}</div>}
      {saved && <div className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-700">تم الحفظ ✅</div>}

      <button onClick={save} disabled={pending} className="btn-primary w-full">
        {pending ? "..." : "حفظ"}
      </button>
    </div>
  );
}

/** ٢٤ ← «١٢ منتصف الليل»، ٢٦ ← «٢ فجراً». الساعة ٢٦ لا تُقرأ، و«٢ فجراً» تُقرأ. */
function hourAr(h: number) {
  const n = Math.round(Number(h) || 0);
  if (n === 24) return "١٢ منتصف الليل";
  if (n > 24) return `${n - 24} فجراً`;
  if (n === 12) return "١٢ ظهراً";
  if (n === 0) return "١٢ منتصف الليل";
  return n > 12 ? `${n - 12} مساءً` : `${n} صباحاً`;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="mb-1 block font-medium text-ink">{label}</span>
      <p className="mb-2 text-xs leading-relaxed text-muted">{hint}</p>
      {children}
    </div>
  );
}

function CountOption({
  active,
  onClick,
  title,
  desc,
  warn,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
  warn?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap w-full rounded-xl border p-3 text-right ${
        active
          ? warn
            ? "border-red-400 bg-red-50"
            : "border-accent bg-accent/10"
          : "border-line bg-cream"
      }`}
    >
      <span className="block text-sm font-bold text-ink">{title}</span>
      <span className="mt-0.5 block text-xs leading-relaxed text-muted">{desc}</span>
    </button>
  );
}
