"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { GROUPS, type PermRow } from "@/lib/permission-labels";
import { setBaristaPermissionAction } from "@/app/manage/permissions-actions";

/**
 * صلاحيات الباريستا.
 *
 * كل سطر يقول **ماذا يستطيع أن يفعل في المحلّ**، لا اسم الصلاحية. وما له
 * ثمن يُقال ثمنه قبل منحه — لا بعد أن يظهر الفرق.
 */
export default function PermissionsEditor({ perms }: { perms: PermRow[] }) {
  const [ask, setAsk] = useState<{ p: PermRow; grant: boolean } | null>(null);
  const router = useRouter();

  const granted = perms.filter((p) => p.granted).length;

  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-display text-lg font-bold text-ink">صلاحيات الباريستا</h2>
        <p className="mt-1 text-sm text-muted">
          <span className="nums">{granted}</span> صلاحية ممنوحة. كل تغيير يحتاج
          رمزك، ويُسجَّل باسمك وتاريخه.
        </p>
      </header>

      {GROUPS.map((g) => {
        const rows = perms.filter((p) => p.scope === g.scope);
        if (rows.length === 0) return null;
        return (
          <div key={g.scope} className="card p-4">
            <div className="mb-3">
              <h3 className="font-display text-sm font-bold text-ink">{g.title}</h3>
              {g.hint && <p className="text-xs text-muted">{g.hint}</p>}
            </div>
            <ul className="divide-y divide-line">
              {rows.map((p) => (
                <li key={p.key} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">{p.label}</p>
                    {p.ownerOnly ? (
                      <p className="mt-0.5 text-xs text-muted">
                        <span className="font-semibold">للمالك وحده.</span> {p.ownerOnly}
                      </p>
                    ) : p.risk ? (
                      <p className="mt-0.5 text-xs text-amber-700">{p.risk}</p>
                    ) : null}
                  </div>

                  {p.ownerOnly ? (
                    <span className="chip shrink-0 bg-dark/5 text-muted">مقفلة</span>
                  ) : (
                    <button
                      onClick={() => setAsk({ p, grant: !p.granted })}
                      role="switch"
                      aria-checked={p.granted}
                      aria-label={p.label}
                      className={`tap relative h-7 w-12 shrink-0 rounded-full transition ${
                        p.granted ? "bg-accent" : "bg-dark/15"
                      }`}
                    >
                      <span
                        className={`absolute top-1 h-5 w-5 rounded-full bg-cream shadow transition-all ${
                          p.granted ? "right-1" : "right-6"
                        }`}
                      />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {ask && (
        <ConfirmDialog
          row={ask.p}
          grant={ask.grant}
          onClose={() => setAsk(null)}
          onDone={() => {
            setAsk(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}

function ConfirmDialog({
  row,
  grant,
  onClose,
  onDone,
}: {
  row: PermRow;
  grant: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Modal title={grant ? `منح: ${row.label}` : `سحب: ${row.label}`} onClose={onClose}>
      <div className="space-y-4">
        {grant && row.risk && (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <span className="font-semibold">قبل أن تمنحها:</span> {row.risk}
          </div>
        )}
        {!grant && (
          <p className="rounded-xl bg-sand p-3 text-xs text-muted">
            بعد السحب لن يستطيع الباريستا هذا، وسيظهر له سبب الرفض في شاشته.
          </p>
        )}

        <div>
          <label htmlFor="opin" className="mb-1.5 block text-sm font-semibold text-ink">
            رمز المالك
          </label>
          <input
            id="opin"
            className="field nums text-center text-xl tracking-[0.3em]"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>

        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

        <div className="grid grid-cols-2 gap-2">
          <button onClick={onClose} className="btn-ghost py-3">
            إلغاء
          </button>
          <button
            onClick={() => {
              setError(null);
              start(async () => {
                const r = await setBaristaPermissionAction(row.key, grant, pin);
                if (!r.ok) return setError(r.error);
                onDone();
              });
            }}
            disabled={pending || !pin}
            className="btn-primary py-3 disabled:opacity-40"
          >
            {pending ? "…" : grant ? "امنح" : "اسحب"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
