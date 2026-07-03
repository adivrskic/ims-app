import "server-only";
import { createHash } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { effectivePermissions, type Permission } from "@/lib/permissions";

/**
 * Authentication for the public API (Authorization: Bearer <key>).
 *
 * Keys are minted in Settings → API keys as `nb_live_xxxx_<raw>` and stored as
 * a sha256 hash (the raw token is shown once). A key inherits the RBAC of the
 * member who created it: we resolve that member's effective permissions for the
 * key's org, so an API caller can do exactly what its issuer could — no more.
 *
 * Returns null for any failure (missing/invalid/revoked key, or an issuer who
 * is no longer a member) so callers can answer a uniform 401.
 */

export interface ApiKeyContext {
  /** The api_keys row id — stable bucket key for rate limiting. */
  keyId: string;
  orgId: string;
  /** The member who issued the key — the identity the key acts as. */
  userId: string;
  scopes: string[];
  can: (p: Permission) => boolean;
}

function extractBearer(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1].trim() : null;
}

export async function authenticateApiKey(
  req: Request
): Promise<ApiKeyContext | null> {
  const token = extractBearer(req);
  if (!token) return null;

  const hash = createHash("sha256").update(token).digest("hex");
  const admin = createAdminClient();

  const { data: key } = await admin
    .from("api_keys")
    .select("id, org_id, created_by, scopes, revoked_at")
    .eq("key_hash", hash)
    .is("revoked_at", null)
    .maybeSingle();
  if (!key) return null;

  const k = key as {
    id: string;
    org_id: string;
    created_by: string;
    scopes: string[] | null;
  };

  // Resolve the issuing member's effective RBAC for this org. If they've since
  // been removed, the key is inert (we don't silently grant orphaned access).
  const { data: member } = await admin
    .from("org_members")
    .select("role, permissions")
    .eq("org_id", k.org_id)
    .eq("user_id", k.created_by)
    .maybeSingle();
  if (!member) return null;

  const m = member as { role: string; permissions: string[] | null };
  const perms = effectivePermissions(m.role, m.permissions);

  // Stamp last_used_at (best-effort; never block the request on it).
  await admin
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", k.id);

  return {
    keyId: k.id,
    orgId: k.org_id,
    userId: k.created_by,
    scopes: k.scopes ?? [],
    can: (p: Permission) => perms.has(p),
  };
}

/** Per-key request budget for /api/v1/*. */
export const API_RATE_LIMIT = { max: 120, windowSeconds: 60 };

/** Standard 429 with Retry-After when a key exhausts its window. */
export function apiRateLimited(retryAfter: number): Response {
  return new Response(
    JSON.stringify({ error: "Rate limit exceeded", retry_after: retryAfter }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfter),
      },
    }
  );
}

/** Standard 401 body for unauthenticated API requests. */
export function apiUnauthorized(): Response {
  return new Response(
    JSON.stringify({ error: "Invalid or missing API key" }),
    { status: 401, headers: { "Content-Type": "application/json" } }
  );
}

/** Standard 403 body when the key's identity lacks a required permission. */
export function apiForbidden(permission: string): Response {
  return new Response(
    JSON.stringify({ error: `Missing permission: ${permission}` }),
    { status: 403, headers: { "Content-Type": "application/json" } }
  );
}
