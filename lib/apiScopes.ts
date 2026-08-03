/**
 * Public-API scopes — the single source of truth.
 *
 * Scopes are a SECOND gate, narrower than RBAC. A request must satisfy both:
 *
 *   1. the scope stamped on the key   (what this key is allowed to do)
 *   2. the issuer's RBAC permission   (what the person who minted it can do)
 *
 * That ordering matters: a key can only ever be a subset of its issuer's
 * authority, so narrowing a key is always safe, and revoking the issuer's
 * membership still kills the key (see lib/apiAuth.ts).
 *
 * Previously these strings lived only in the create-key form, were never
 * validated on write, and were never checked on read — so a "read products"
 * key could POST scans. Keep this list and the route mapping below in sync;
 * they are the contract the docs on /settings/api-keys advertise.
 */

export const API_SCOPES = [
  { id: "scan:read", label: "Read scans" },
  { id: "scan:write", label: "Log scans" },
  { id: "product:read", label: "Read products" },
  { id: "product:write", label: "Manage products" },
  { id: "location:read", label: "Read locations" },
  { id: "location:write", label: "Place inventory" },
  { id: "order:read", label: "Read orders" },
  { id: "order:write", label: "Manage orders" },
] as const;

export type ApiScope = (typeof API_SCOPES)[number]["id"];

const VALID = new Set<string>(API_SCOPES.map((s) => s.id));

export function isApiScope(value: string): value is ApiScope {
  return VALID.has(value);
}

/** Drop anything that isn't a known scope, and de-duplicate. */
export function sanitizeScopes(values: string[]): ApiScope[] {
  return [...new Set(values.filter(isApiScope))];
}
