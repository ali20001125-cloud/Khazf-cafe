"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import MyPinDialog from "@/components/MyPinDialog";
import { timeAr } from "@/lib/format";
import type { StaffRow } from "@/lib/users";
import {
  resetUserPinAction,
  createUserAction,
  setUserActiveAction,
  unlockUserAction,
} from "@/app/manage/users-actions";

/**
 * شاشة الموظفين والرموز.
 *
 * الرمز هنا ليس كلمة مرور فقط — هو ما يُثبت من دخل ومن وافق على إلغاء
 * فاتورة. فالشاشة تقول ذلك صريحاً، ولا تعرض رمزاً لأحد: المالك **يعيّن**
 * رمزاً جديداً ولا يقرأ القديم.
 */

type Dialog =
  | { kind: "my_pin" }
  | { kind: "reset"; user: StaffRow }
  | { kind: "add" }
  | { kind: "toggle"; user: StaffRow }
  | null;

export default function StaffManager({
  staff,
  meId,
  canManage,
}: {
  staff: StaffRow[];
  meId: string;
  canManage: boolean;
}) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const router = useRouter();
  const defaults = staff.filter((u) => u.active && !u.pin_changed_at);

  function done() {
    setDialog(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {defaults.length > 0 && (
        <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-4">
          <p className="font-display font-bold text-red-700">
            {defaults.length === 1
              ? `رمز ${defaults[0].name} ما زال الرمز الافتراضي`
              : `${defaults.length} رموز ما زالت افتراضية`}
          </p>
          <p className="mt-1 text-sm text-red-800">
            الرموز الافتراضية (1111 · 0000) معروفة لكل من رأى نظاماً مثل هذا.
            ورمز المالك هو نفسه رمز الموافقة على إلغاء فاتورة مدفوعة وعلى
            إرجاع المال — فمن يعرفه يفتح باب الصندوق. غيّره الآن.
          </p>
        </div>
      )}

      <button onClick={() => setDialog({ kind: "my_pin" })} className="btn-primary w-full py-3">
        غيّر رمزي
      </button>

      <ul className="card divide-y divide-line">
        {staff.map((u) => {
          const locked = u.locked_until && new Date(u.locked_until).getTime() > Date.now();
          return (
            <li key={u.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display font-bold text-ink">
                    {u.name}
                    {u.id === meId && <span className="mr-1.5 text-xs text-muted">(أنت)</span>}
                  </p>
                  <p className="text-xs text-muted">
                    {u.role === "owner" ? "مالك — كل الصلاحيات" : "باريستا — بيع وتشغيل، بلا مال ولا تقارير"}
                  </p>

                  <div className="mt-2 space-y-0.5 text-xs">
                    {!u.active && <Tag tone="muted">معطّل — لا يستطيع الدخول</Tag>}
                    {u.active && !u.pin_changed_at && <Tag tone="red">الرمز افتراضي — غيّره</Tag>}
                    {locked && (
                      <Tag tone="amber">
                        مقفل حتى {timeAr(u.locked_until!)} بعد {u.failed_pin_attempts || 5} محاولات
                      </Tag>
                    )}
                    {u.has_open_shift && <Tag tone="green">وردية مفتوحة الآن</Tag>}
                    {u.last_login_at && (
                      <p className="text-muted">آخر دخول {timeAr(u.last_login_at)}</p>
                    )}
                    <p className="nums text-muted">
                      {u.shifts_count} وردية · {u.orders_count} فاتورة باسمه
                    </p>
                  </div>
                </div>

                {canManage && (
                  <div className="flex shrink-0 flex-col gap-1.5">
                    {locked && (
                      <UnlockButton id={u.id} onDone={done} />
                    )}
                    <button
                      onClick={() => setDialog({ kind: "reset", user: u })}
                      className="btn-ghost px-3 py-2 text-xs"
                    >
                      رمز جديد
                    </button>
                    {u.id !== meId && (
                      <button
                        onClick={() => setDialog({ kind: "toggle", user: u })}
                        className="btn-ghost px-3 py-2 text-xs"
                      >
                        {u.active ? "تعطيل" : "تفعيل"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {canManage && (
        <button onClick={() => setDialog({ kind: "add" })} className="btn-ghost w-full py-3">
          + إضافة موظف
        </button>
      )}

      <p className="px-1 text-xs leading-relaxed text-muted">
        الموظف لا يُحذف أبداً — يُعطَّل. اسمه معلّق على فواتير وورديات وحركات
        كاش، وحذفه يمسح تاريخاً لا يُستعاد. والمعطَّل لا يدخل النظام أصلاً.
      </p>

      {dialog?.kind === "my_pin" && <MyPinDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "reset" && (
        <ResetPinDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />
      )}
      {dialog?.kind === "add" && <AddUserDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "toggle" && (
        <ToggleDialog user={dialog.user} onClose={() => setDialog(null)} onDone={done} />
      )}
    </div>
  );
}

// ── حوارات ───────────────────────────────────────────────────────────

function ResetPinDialog({
  user,
  onClose,
  onDone,
}: {
  user: StaffRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [next, setNext] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Modal title={`رمز جديد لـ${user.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">
          لا تُقرأ الرموز — ولا للمالك. أنت لا ترى رمز {user.name} القديم، بل
          تعيّن واحداً جديداً وتخبره به. بعدها يكدر يغيّره بنفسه من «غيّر رمزي».
        </p>
        <Pin label="الرمز الجديد" value={next} onChange={setNext} hint="٤ إلى ٨ أرقام" />
        <Pin label="رمز المالك (للموافقة)" value={ownerPin} onChange={setOwnerPin} />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <Actions
          pending={pending}
          disabled={!next || !ownerPin}
          onCancel={onClose}
          label="تعيين"
          onSubmit={() => {
            setError(null);
            start(async () => {
              const r = await resetUserPinAction(user.id, next, ownerPin);
              if (!r.ok) return setError(r.error);
              onDone();
            });
          }}
        />
      </div>
    </Modal>
  );
}

function AddUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"owner" | "barista">("barista");
  const [pin, setPin] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <Modal title="إضافة موظف" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label htmlFor="nm" className="mb-1.5 block text-sm font-semibold text-ink">
            الاسم
          </label>
          <input
            id="nm"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="يظهر على الفواتير والورديات"
          />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink">الدور</span>
          <div className="space-y-2">
            <RoleCard
              active={role === "barista"}
              onClick={() => setRole("barista")}
              title="باريستا"
              desc="يبيع ويفتح وردية ويسجّل هدراً. لا يرى مبلغاً متوقّعاً ولا تقريراً مالياً، ولا يلغي فاتورة مدفوعة."
            />
            <RoleCard
              active={role === "owner"}
              onClick={() => setRole("owner")}
              title="مالك"
              desc="كل الصلاحيات: المال والتقارير والإلغاء والإرجاع والإعدادات. ورمزه يوافق على العمليات الحسّاسة."
            />
          </div>
        </div>

        <Pin label="رمز دخوله" value={pin} onChange={setPin} hint="٤ إلى ٨ أرقام — أخبره به" />
        <Pin label="رمز المالك (للموافقة)" value={ownerPin} onChange={setOwnerPin} />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <Actions
          pending={pending}
          disabled={!name.trim() || !pin || !ownerPin}
          onCancel={onClose}
          label="إضافة"
          onSubmit={() => {
            setError(null);
            start(async () => {
              const r = await createUserAction({ name, role, pin, ownerPin });
              if (!r.ok) return setError(r.error);
              onDone();
            });
          }}
        />
      </div>
    </Modal>
  );
}

function ToggleDialog({
  user,
  onClose,
  onDone,
}: {
  user: StaffRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [ownerPin, setOwnerPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const turningOff = user.active;

  return (
    <Modal title={`${turningOff ? "تعطيل" : "تفعيل"} ${user.name}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="rounded-xl bg-sand p-3 text-xs leading-relaxed text-muted">
          {turningOff
            ? `${user.name} لن يستطيع الدخول بعد الآن. فواتيره وورديّاته (${user.orders_count} فاتورة · ${user.shifts_count} وردية) تبقى كما هي — التعطيل ليس حذفاً.`
            : `${user.name} سيستطيع الدخول برمزه السابق.`}
        </p>
        <div>
          <label htmlFor="rs" className="mb-1.5 block text-sm font-semibold text-ink">
            السبب <span className="text-red-600">*</span>
          </label>
          <input
            id="rs"
            className="field"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={turningOff ? "ترك العمل؟ إجازة طويلة؟" : "عاد للعمل؟"}
          />
        </div>
        <Pin label="رمز المالك (للموافقة)" value={ownerPin} onChange={setOwnerPin} />
        {error && <p className="text-sm font-medium text-red-600">{error}</p>}
        <Actions
          pending={pending}
          disabled={!reason.trim() || !ownerPin}
          onCancel={onClose}
          label={turningOff ? "تعطيل" : "تفعيل"}
          onSubmit={() => {
            setError(null);
            start(async () => {
              const r = await setUserActiveAction(user.id, !user.active, ownerPin, reason);
              if (!r.ok) return setError(r.error);
              onDone();
            });
          }}
        />
      </div>
    </Modal>
  );
}

function UnlockButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [pending, start] = useTransition();
  return (
    <button
      onClick={() => start(async () => { await unlockUserAction(id); onDone(); })}
      disabled={pending}
      className="btn-ghost px-3 py-2 text-xs disabled:opacity-40"
    >
      {pending ? "…" : "فكّ القفل"}
    </button>
  );
}

// ── قطع صغيرة ────────────────────────────────────────────────────────

function Pin({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  const id = `pin-${label.replace(/\s/g, "-")}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink">
        {label}
      </label>
      <input
        id={id}
        className="field nums text-center text-xl tracking-[0.3em]"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))}
      />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Actions({
  pending,
  disabled,
  onCancel,
  onSubmit,
  label,
}: {
  pending: boolean;
  disabled: boolean;
  onCancel: () => void;
  onSubmit: () => void;
  label: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button onClick={onCancel} className="btn-ghost py-3">
        إلغاء
      </button>
      <button
        onClick={onSubmit}
        disabled={pending || disabled}
        className="btn-primary py-3 disabled:opacity-40"
      >
        {pending ? "…" : label}
      </button>
    </div>
  );
}

function Tag({ tone, children }: { tone: "red" | "amber" | "green" | "muted"; children: React.ReactNode }) {
  const cls = {
    red: "bg-red-100 text-red-700",
    amber: "bg-amber-100 text-amber-800",
    green: "bg-emerald-100 text-emerald-800",
    muted: "bg-dark/5 text-muted",
  }[tone];
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 font-medium ${cls}`}>{children}</span>
  );
}

function RoleCard({
  active,
  onClick,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`tap w-full rounded-xl border p-3 text-right ${
        active ? "border-accent bg-accent/10" : "border-line bg-cream"
      }`}
    >
      <span className="block text-sm font-bold text-ink">{title}</span>
      <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">{desc}</span>
    </button>
  );
}
