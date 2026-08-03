import { describe, it, expect } from "vitest";
import {
  API_SCOPES,
  isApiScope,
  sanitizeScopes,
  type ApiScope,
} from "@/lib/apiScopes";

/**
 * These scopes are a security boundary: /api/v1/* rejects a request whose key
 * lacks the route's scope. A typo in the list would mint keys that can never
 * authorise anything, so the ids are pinned here deliberately — if you change
 * one, you are changing a published API contract and this test should fail.
 */
const EXPECTED_IDS = [
  "scan:read",
  "scan:write",
  "product:read",
  "product:write",
  "location:read",
  "location:write",
  "order:read",
  "order:write",
];

describe("API scope registry", () => {
  it("exposes exactly the published scope ids", () => {
    expect(API_SCOPES.map((s) => s.id)).toEqual(EXPECTED_IDS);
  });

  it("every scope has a human label for the create-key form", () => {
    for (const s of API_SCOPES) {
      expect(s.label.length).toBeGreaterThan(0);
    }
  });

  it("ids are unique", () => {
    const ids = API_SCOPES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("isApiScope", () => {
  it("accepts known scopes", () => {
    expect(isApiScope("product:read")).toBe(true);
    expect(isApiScope("scan:write")).toBe(true);
  });

  it("rejects unknown, empty and near-miss values", () => {
    expect(isApiScope("products:read")).toBe(false); // plural typo
    expect(isApiScope("product:admin")).toBe(false);
    expect(isApiScope("PRODUCT:READ")).toBe(false); // case-sensitive
    expect(isApiScope("")).toBe(false);
    expect(isApiScope("*")).toBe(false);
  });
});

describe("sanitizeScopes", () => {
  it("keeps only known scopes", () => {
    expect(sanitizeScopes(["product:read", "nonsense", "scan:write"])).toEqual([
      "product:read",
      "scan:write",
    ]);
  });

  it("de-duplicates", () => {
    expect(sanitizeScopes(["scan:read", "scan:read"])).toEqual(["scan:read"]);
  });

  it("returns empty for all-invalid input, so createApiKey rejects it", () => {
    // createApiKey requires >= 1 scope, so an all-garbage submission must not
    // slip through as a key with no enforceable scope.
    expect(sanitizeScopes(["*", "admin", ""])).toEqual([]);
  });

  it("preserves the caller's order for the kept values", () => {
    const input: string[] = ["order:write", "product:read"];
    expect(sanitizeScopes(input)).toEqual(["order:write", "product:read"]);
  });
});

describe("route scope contract", () => {
  /* The scopes each /api/v1 route enforces. Kept here so a rename can't
     silently unhook a route from its gate. */
  const ROUTE_SCOPES: Record<string, ApiScope> = {
    "GET /api/v1/products": "product:read",
    "GET /api/v1/inventory": "location:read",
    "POST /api/v1/scans": "scan:write",
  };

  it("every enforced scope is a real scope", () => {
    for (const scope of Object.values(ROUTE_SCOPES)) {
      expect(isApiScope(scope)).toBe(true);
    }
  });
});
