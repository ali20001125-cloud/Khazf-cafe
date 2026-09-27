import { describe, expect, it } from "vitest";
import { cleanOrigin, customerOrigin } from "./public-url";

describe("cleanOrigin", () => {
  it("accepts a bare host", () => {
    expect(cleanOrigin("mediumspringgreen-x.hostingersite.com")).toBe(
      "https://mediumspringgreen-x.hostingersite.com"
    );
  });
  it("strips the path and trailing slash", () => {
    expect(cleanOrigin(" https://Menu.Khazaf.com/menu/ ")).toBe("https://menu.khazaf.com");
  });
  it("rejects junk", () => {
    expect(cleanOrigin("")).toBeNull();
    expect(cleanOrigin("menu")).toBeNull();
    expect(cleanOrigin("javascript:alert(1)")).toBeNull();
    expect(cleanOrigin("https://a:b@x.com")).toBeNull();
    expect(cleanOrigin(42)).toBeNull();
  });
});

describe("customerOrigin", () => {
  it("prefers the setting", () => {
    expect(customerOrigin("menu.example.com", "admin.example.com", "https")).toEqual({
      origin: "https://menu.example.com",
      configured: true,
    });
  });
  it("falls back to the current host and says so", () => {
    expect(customerOrigin(undefined, "admin.example.com", "https")).toEqual({
      origin: "https://admin.example.com",
      configured: false,
    });
  });
});
