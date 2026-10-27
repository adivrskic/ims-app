import { describe, expect, it } from "vitest";
import { isIsoDate, isUuid } from "@/lib/net/validate";

describe("isUuid", () => {
  it("accepts canonical lowercase and uppercase UUIDs", () => {
    expect(isUuid("6f1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(true);
    expect(isUuid("6F1C2A0E-3B4D-4E5F-8A9B-0C1D2E3F4A5B")).toBe(true);
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(true);
  });

  it("rejects non-strings and near-misses", () => {
    expect(isUuid(null)).toBe(false);
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(42)).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid("all")).toBe(false);
    expect(isUuid("6f1c2a0e3b4d4e5f8a9b0c1d2e3f4a5b")).toBe(false); // no dashes
    expect(isUuid("6f1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5")).toBe(false); // short
    expect(isUuid("6f1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5bz")).toBe(false); // long
    expect(isUuid("gf1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(false); // non-hex
    expect(isUuid(" 6f1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(false); // padding
  });

  it("rejects PostgREST filter injection attempts", () => {
    expect(isUuid("6f1c2a0e-3b4d-4e5f-8a9b-0c1d2e3f4a5b,or.id.neq.x")).toBe(
      false
    );
    expect(isUuid("in.(a,b)")).toBe(false);
  });
});

describe("isIsoDate", () => {
  it("accepts dates and date-times", () => {
    expect(isIsoDate("2026-10-26")).toBe(true);
    expect(isIsoDate("2026-10-26T12:34:56Z")).toBe(true);
    expect(isIsoDate("2026-10-26T12:34:56.789Z")).toBe(true);
    expect(isIsoDate("2026-10-26T12:34:56+02:00")).toBe(true);
  });

  it("rejects malformed or impossible values", () => {
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate("yesterday")).toBe(false);
    expect(isIsoDate("26/10/2026")).toBe(false);
    expect(isIsoDate("2026-13-45")).toBe(false);
    expect(isIsoDate("2026-10-26T99:99:99Z")).toBe(false);
    expect(isIsoDate(20261026)).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});
