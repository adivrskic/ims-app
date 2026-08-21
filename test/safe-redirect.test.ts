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

/* The signup flow now threads `next` through so an invitee who has to
   create an account lands back on their invite instead of being sent to
   /onboarding to make a second, empty workspace. That redirect is
   attacker-influenced (it arrives as a query param), so the invite shape
   specifically must survive the guard, and hostile look-alikes must not. */
describe("safeNext — invite destinations", () => {
  const token = "a".repeat(32);

  it("preserves a genuine invite path", () => {
    expect(safeNext(`/invite/${token}`)).toBe(`/invite/${token}`);
  });

  it("preserves an invite path carrying a query string", () => {
    expect(safeNext(`/invite/${token}?src=email`)).toBe(
      `/invite/${token}?src=email`
    );
  });

  it("rejects an off-site look-alike", () => {
    expect(safeNext(`https://evil.test/invite/${token}`)).toBe("/");
    expect(safeNext(`//evil.test/invite/${token}`)).toBe("/");
  });
});
