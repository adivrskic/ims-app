import { describe, expect, it } from "vitest";
import { clientIpFrom } from "@/lib/rateLimit";

function headersOf(map: Record<string, string>) {
  return (name: string) => map[name] ?? null;
}

describe("clientIpFrom", () => {
  it("prefers the Netlify connection header", () => {
    expect(
      clientIpFrom(
        headersOf({
          "x-nf-client-connection-ip": "203.0.113.7",
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
        })
      )
    ).toBe("203.0.113.7");
  });

  it("falls back to the first x-forwarded-for hop", () => {
    expect(
      clientIpFrom(headersOf({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))
    ).toBe("198.51.100.1");
  });

  it("trims whitespace around forwarded entries", () => {
    expect(
      clientIpFrom(headersOf({ "x-forwarded-for": "  198.51.100.1 , 10.0.0.1" }))
    ).toBe("198.51.100.1");
  });

  it("returns 'unknown' with no headers (local dev)", () => {
    expect(clientIpFrom(headersOf({}))).toBe("unknown");
  });

  it("ignores an empty forwarded header", () => {
    expect(clientIpFrom(headersOf({ "x-forwarded-for": "" }))).toBe("unknown");
  });
});
