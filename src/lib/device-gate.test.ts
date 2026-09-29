import { describe, expect, it } from "vitest";
import { deviceToken, deviceTrusted, sameText } from "./device-gate";

describe("device gate", () => {
  it("is open when no key is configured", async () => {
    expect(await deviceTrusted(undefined, null)).toBe(true);
  });

  it("rejects a device without the cookie", async () => {
    expect(await deviceTrusted(undefined, "k".repeat(32))).toBe(false);
  });

  it("accepts the token of the configured key and nothing else", async () => {
    const key = "a-long-secret-key-for-the-shop-123";
    const token = await deviceToken(key);
    expect(await deviceTrusted(token, key)).toBe(true);
    expect(await deviceTrusted(token, key + "x")).toBe(false);
    // the raw key itself is not a valid cookie
    expect(await deviceTrusted(key, key)).toBe(false);
  });

  it("token is a sha-256 hex digest", async () => {
    expect(await deviceToken("x")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("sameText compares exactly", () => {
    expect(sameText("abc", "abc")).toBe(true);
    expect(sameText("abc", "abd")).toBe(false);
    expect(sameText("abc", "ab")).toBe(false);
  });
});
