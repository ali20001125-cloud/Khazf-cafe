import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionData } from "./session";

/**
 * الحارس الذي تمرّ به كل الأفعال الخادمية.
 *
 * القفل يُفحص هنا لا في الواجهة. ولو كان في الواجهة وحدها لكان رسماً:
 * الستارة تُغطّي الأزرار ولا تمنع طلباً يُرسَل مباشرةً. فهذا الاختبار
 * يُثبت أن **الفعل نفسه** يُرفض ما دام الوسم قائماً — حتى لمن يملك
 * الصلاحية.
 */
let session: SessionData | null = null;

vi.mock("./auth", () => ({ currentUser: () => session }));
vi.mock("./db", () => ({
  // المالك يملك كل شيء — كي يكون الرفض بسبب القفل وحده لا بسبب صلاحية
  db: () => async () => [{ permission: "settings.manage" }, { permission: "orders.create" }],
}));

const { requirePermission, AuthError, clearPermissionCache } = await import("./permissions");

const base: SessionData = {
  uid: "u1", bid: "b1", role: "owner", name: "المالك",
  iat: Math.floor(Date.now() / 1000),
};

describe("requirePermission — القفل يُرفض عند الفعل لا عند الرسم", () => {
  beforeEach(() => clearPermissionCache());

  it("يمرّ حين تكون الجلسة مفتوحة", async () => {
    session = { ...base };
    await expect(requirePermission("settings.manage")).resolves.toMatchObject({ uid: "u1" });
  });

  it("يُرفض حين تكون موسومةً مقفلة — ولو كان مالكاً", async () => {
    session = { ...base, lk: 1 };
    await expect(requirePermission("settings.manage")).rejects.toThrow(AuthError);
    await expect(requirePermission("settings.manage")).rejects.toMatchObject({ code: "locked" });
  });

  // القفل يسبق فحص الصلاحية: لا يُفشى للمقفول عليه أيّ صلاحية يملك
  it("القفل يسبق «لا تملك صلاحية»", async () => {
    session = { ...base, lk: 1 };
    await expect(requirePermission("audit.view")).rejects.toMatchObject({ code: "locked" });
  });

  it("بلا جلسة: غير مُصادَق", async () => {
    session = null;
    await expect(requirePermission("orders.create")).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });
});
