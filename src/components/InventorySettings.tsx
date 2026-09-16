"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { stockLabel, num } from "@/lib/format";
import type { MaterialUnit, WasteReason } from "@/lib/inventory-overview";
import {
  addMaterialUnitAction,
  removeMaterialUnitAction,
  setParLevelAction,
  setHopperGramsAction,
  addWasteReasonAction,
  setWasteReasonActiveAction,
} from "@/app/manage/actions";

type Mat = {
  id: string; name: string; base_unit: string; stock: number;
  low_threshold: number; par_level: number;
  /** ما يبقى عالقاً في المطحنة ولا يُسكب (هجرة 0038). */
  hopper_grams: number;
};

/**
 * إعدادات المخزون: وحدات الشراء · المطلوب بعد الشراء · أسباب الهدر.
 *
 * الفكرة الحاكمة: **يُعرَّف مرّة ويُستعمل دائماً**. من يعرّف «كرتون = ١٢
 * لتر» اليوم لا يحوّل في رأسه مرّة أخرى.
 */
export default function InventorySettings({
  materials,
  units,
  reasons,
}: {
  materials: Mat[];
  units: MaterialUnit[];
  reasons: WasteReason[];
}) {
  const [open, setOpen] = useState(false);
  const [unitFor, setUnitFor] = useState<Mat | null>(null);
  const [parFor, setParFor] = useState<Mat | null>(null);
  const [hopperFor, setHopperFor] = useState<Mat | null>(null);
  const [newReason, setNewReason] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const refresh = () => router.refresh();

  const unitsOf = (id: string) => units.filter((u) => u.material_id === id);

  // مطويّة افتراضياً: هذه إعدادات تُضبط مرّةً ثم لا تُفتح لأسابيع، وبقاؤها
  // مفتوحةً يُطيل صفحة المخزون حتى يضيع فيها ما يُقرأ كل يوم.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="card flex w-full items-center justify-between p-5 text-right"
        aria-expanded="false"
      >
        <span>
          <span className="block font-display text-sm font-bold text-ink">
            إعدادات المخزون
          </span>
          <span className="block text-xs text-muted">
            بأي شيء تشتري كل مادة · كم تريد يبقى منها · أسباب الهدر
          </span>
        </span>
        <span className="text-muted" aria-hidden="true">▾</span>
      </button>
    );
  }

  return (
    <div className="space-y-6">
      <button
        onClick={() => setOpen(false)}
        className="flex w-full items-center justify-between text-right"
        aria-expanded="true"
      >
        <span className="font-display text-sm font-bold text-ink">إعدادات المخزون</span>
        <span className="text-xs text-muted">إخفاء ▴</span>
      </button>
      {/* لكل مادة سطران بلغةٍ مفهومة، لا زرّان باسمين مبهمين («+ وحدة» و«المطلوب»). */}
      <section className="card p-5">
        <h2 className="font-display text-sm font-bold text-ink">كيف تشتري كل مادة</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          جوابان لكل مادة: <span className="font-semibold text-ink">بأي شيء تشتريها</span>{" "}
          (كرتون؟ كيس؟)، و<span className="font-semibold text-ink">كم تريد أن يبقى عندك</span>.
          بهما تحسب لك قائمة الشراء «اشترِ ٣ كراتين» بدل «ناقص ٢٬٤٠٠ مل».
        </p>

        <ul className="mt-4 divide-y divide-line">
          {materials.map((m) => {
            const us = unitsOf(m.id);
            return (
              <li key={m.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-display font-bold text-ink">
                      {m.name}
                      <span className="nums mr-2 text-xs font-normal text-muted">
                        الآن {stockLabel(m.stock, m.base_unit)}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      تريد يبقى عندك:{" "}
                      {m.par_level > 0 ? (
                        <span className="nums font-semibold text-ink">
                          {stockLabel(m.par_level, m.base_unit)}
                        </span>
                      ) : (
                        <span className="text-amber-700">
                          ما حدّدته — فلن تقترح عليك قائمة الشراء شيئاً
                        </span>
                      )}
                    </p>
                    {/* العالق في المطحنة يخصّ الحبوب وحدها — لا الحليب ولا الأكواب */}
                    {m.base_unit === "g" && m.hopper_grams > 0 && (
                      <p className="nums mt-0.5 text-xs text-muted">
                        عالق في المطحنة:{" "}
                        <span className="font-semibold text-ink">{num(m.hopper_grams)} غ</span>
                      </p>
                    )}
                    <p className="mt-0.5 text-xs text-muted">
                      {us.length > 0 ? "تشتريها بـ:" : (
                        <span className="text-amber-700">
                          ما حدّدت وحدة الشراء — ستُدخل الكمية بالـ{m.base_unit === "g" ? "غرام" : m.base_unit === "ml" ? "مليلتر" : "حبّة"}
                        </span>
                      )}
                    </p>
                    {us.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {us.map((u) => (
                          <span key={u.id} className="chip bg-dark/5 text-muted">
                            {u.name} = {num(u.base_qty)}
                            {u.is_default && <span className="mr-1 text-accent">★</span>}
                            <button
                              onClick={() =>
                                start(async () => {
                                  await removeMaterialUnitAction(u.id);
                                  refresh();
                                })
                              }
                              aria-label={`أزل ${u.name}`}
                              className="mr-1.5 text-muted hover:text-red-600"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-col gap-1.5">
                    <button onClick={() => setUnitFor(m)} className="btn-ghost whitespace-nowrap px-3 py-2 text-xs">
                      + وحدة شراء
                    </button>
                    <button onClick={() => setParFor(m)} className="btn-ghost whitespace-nowrap px-3 py-2 text-xs">
                      كم يبقى؟
                    </button>
                    {m.base_unit === "g" && (
                      <button onClick={() => setHopperFor(m)} className="btn-ghost whitespace-nowrap px-3 py-2 text-xs">
                        عالق بالمطحنة
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs text-muted">
          ★ = الوحدة التي تُقترح عليك أوّلاً عند الشراء. والوحدة تُعطَّل ولا
          تُحذف، لأن مشترياتٍ قديمة تشير إليها.
        </p>
      </section>

      {/* أسباب الهدر */}
      <section className="card p-5">
        <h2 className="font-display text-sm font-bold text-ink">أسباب الهدر</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          منها يختار الباريستا عند تسجيل هدر. اجعلها بكلامك — «معايرة» لا
          «dial_in» — لأن ما لا يُفهم يُختار عشوائياً فيفسد التقرير.
        </p>

        <ul className="mt-3 divide-y divide-line">
          {reasons.map((r) => (
            <li key={r.key} className="flex items-center justify-between py-2.5">
              <span className={`text-sm ${r.active ? "text-ink" : "text-muted line-through"}`}>
                {r.label}
              </span>
              <button
                onClick={() =>
                  start(async () => {
                    await setWasteReasonActiveAction(r.key, !r.active);
                    refresh();
                  })
                }
                role="switch"
                aria-checked={r.active}
                aria-label={r.label}
                className={`tap relative h-7 w-12 shrink-0 rounded-full ${
                  r.active ? "bg-accent" : "bg-dark/15"
                }`}
              >
                <span
                  className={`absolute top-1 h-5 w-5 rounded-full bg-cream shadow transition-all ${
                    r.active ? "right-1" : "right-6"
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex gap-2">
          <input
            className="field flex-1"
            placeholder="سبب جديد (مثلاً: كوب وقع)"
            value={newReason}
            onChange={(e) => setNewReason(e.target.value)}
          />
          <button
            onClick={() =>
              start(async () => {
                const r = await addWasteReasonAction(newReason);
                if (r.ok) setNewReason("");
                refresh();
              })
            }
            disabled={pending || newReason.trim().length < 2}
            className="btn-primary px-5 disabled:opacity-40"
          >
            أضف
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          السبب يُعطَّل ولا يُحذف: هدرٌ سُجّل به في الماضي يجب أن يبقى مقروءاً.
        </p>
      </section>

      {unitFor && <UnitDialog mat={unitFor} onClose={() => setUnitFor(null)} onDone={() => { setUnitFor(null); refresh(); }} />}
      {parFor && <ParDialog mat={parFor} onClose={() => setParFor(null)} onDone={() => { setParFor(null); refresh(); }} />}
      {hopperFor && <HopperDialog mat={hopperFor} onClose={() => setHopperFor(null)} onDone={() => { setHopperFor(null); refresh(); }} />}
    </div>
  );
}

function UnitDialog({ mat, onClose, onDone }: { mat: Mat; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [qty, setQty] = useState("");
  const [isDefault, setIsDefault] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unitWord = mat.base_unit === "g" ? "غرام" : mat.base_unit === "ml" ? "مل" : "حبة";

  return (
    <Modal title={`وحدة شراء لـ${mat.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">
          اكتب الوحدة كما تشتري بها فعلاً، وكم {unitWord} فيها. بعدها تكتب «٢» في
          شاشة الشراء وينتهي الأمر.
        </p>
        <div>
          <label htmlFor="un" className="mb-1.5 block text-sm font-semibold text-ink">اسم الوحدة</label>
          <input id="un" className="field" placeholder="كرتون (١٢ × ١ لتر)" value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }} />
        </div>
        <div>
          <label htmlFor="uq" className="mb-1.5 block text-sm font-semibold text-ink">
            كم {unitWord} فيها؟
          </label>
          <input id="uq" className="field nums text-center text-lg" inputMode="numeric" dir="ltr"
            placeholder="12000" value={qty}
            onChange={(e) => { setQty(e.target.value.replace(/\D/g, "")); setError(null); }} />
        </div>
        {/* صندوقٌ افتراضيّ ارتفاعه ١٣ بكسل لا يُلمس — والسطر كلّه يقصده */}
        <label className="tap flex min-h-[44px] cursor-pointer items-center gap-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-[#A66A4C]"
          />
          الوحدة المعتادة لشراء هذه المادة
        </label>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-ghost py-3">إلغاء</button>
          <button
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await addMaterialUnitAction(mat.id, name, Number(qty), isDefault);
                if (!r.ok) return setError(r.error);
                onDone();
              });
            }}
            disabled={pending || !name.trim() || !qty}
            className="btn-primary py-3 disabled:opacity-40"
          >
            {pending ? "…" : "أضف"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ParDialog({ mat, onClose, onDone }: { mat: Mat; onClose: () => void; onDone: () => void }) {
  const [val, setVal] = useState(String(mat.par_level || ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const unitWord = mat.base_unit === "g" ? "غرام" : mat.base_unit === "ml" ? "مل" : "حبة";

  return (
    <Modal title={`المطلوب من ${mat.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">
          كم تريد أن يبقى في المحلّ بعد كل شراء؟ منه تُحسب كمية القائمة: الفرق
          بينه وبين الرصيد هو ما تشتريه. <span className="font-semibold text-ink">
          غير حدّ التنبيه</span> — ذاك يقول متى أُنبّهك، وهذا يقول كم تشتري.
        </p>
        <div>
          <label htmlFor="pl" className="mb-1.5 block text-sm font-semibold text-ink">
            بالـ{unitWord} — الآن {stockLabel(mat.stock, mat.base_unit)}
          </label>
          <input id="pl" className="field nums text-center text-lg" inputMode="numeric" dir="ltr"
            value={val} onChange={(e) => { setVal(e.target.value.replace(/\D/g, "")); setError(null); }} />
          <p className="mt-1 text-xs text-muted">صفر = لا تقترح شراء هذه المادة.</p>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-ghost py-3">إلغاء</button>
          <button
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await setParLevelAction(mat.id, Number(val || 0));
                if (!r.ok) return setError(r.error);
                onDone();
              });
            }}
            disabled={pending}
            className="btn-primary py-3 disabled:opacity-40"
          >
            {pending ? "…" : "حفظ"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * البنّ العالق في المطحنة.
 *
 * يُقاس مرّةً — أوّل تعبئة — ويُضاف بعدها لكل عدّة. ولا يضيفه النظام:
 * المالك قال «أجمعه»، فالجمع بيده والنظام يذكّر. وما يُفترض عن المستخدم
 * يُحسب مرّتين يوماً ما.
 */
function HopperDialog({ mat, onClose, onDone }: { mat: Mat; onClose: () => void; onDone: () => void }) {
  const [val, setVal] = useState(String(mat.hopper_grams || ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Modal title={`العالق في مطحنة ${mat.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">
          البنّ الذي يبقى في المطحنة ولا يُسكب. قِسه{" "}
          <span className="font-semibold text-ink">مرّةً واحدة</span> أوّل ما تعبّئ،
          واتركه — سيظهر لك في شاشة الجرد لتجمعه على ما تزنه.
        </p>
        <div>
          <label htmlFor="hg" className="mb-1.5 block text-sm font-semibold text-ink">
            بالغرام
          </label>
          <input
            id="hg"
            className="field nums text-center text-lg"
            inputMode="numeric"
            dir="ltr"
            placeholder="150"
            value={val}
            onChange={(e) => { setVal(e.target.value.replace(/\D/g, "")); setError(null); }}
          />
          <p className="mt-1 text-xs text-muted">صفر = لا تذكّرني بشيء.</p>
        </div>
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-ghost py-3">إلغاء</button>
          <button
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await setHopperGramsAction(mat.id, Number(val || 0));
                if (!r.ok) return setError(r.error);
                onDone();
              });
            }}
            disabled={pending}
            className="btn-primary py-3 disabled:opacity-40"
          >
            {pending ? "…" : "حفظ"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
