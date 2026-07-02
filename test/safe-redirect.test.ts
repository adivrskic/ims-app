import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/auth/safe-redirect";

describe("safeNext (open-redirect guard)", () => {
  it("allows same-origin absolute paths", () => {
    expect(safeNext("/")).toBe("/");
    expect(safeNext("/inventory")).toBe("/inventory");
    expect(safeNext("/orders?status=open&x=1")).toBe("/orders?status=open&x=1");
  });

  it("blocks off-origin + protocol-relative + backslash tricks", () => {
    expect(safeNext("https://evil.com")).toBe("/");
    expect(safeNext("http://evil.com/path")).toBe("/");
    expect(safeNext("//evil.com")).toBe("/");
    expect(safeNext("/\\evil.com")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
  });

  it("falls back for empty / relative / null-ish input", () => {
    expect(safeNext("")).toBe("/");
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("inventory")).toBe("/"); // not absolute
  });

  it("honors a custom fallback", () => {
    expect(safeNext("https://evil.com", "/home")).toBe("/home");
    expect(safeNext("/ok", "/home")).toBe("/ok");
  });
});
