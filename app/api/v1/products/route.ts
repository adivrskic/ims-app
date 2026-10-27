import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateApiKey,
  apiUnauthorized,
  apiTrialEnded,
  apiMissingScope,
  apiRateLimited,
  isApiIpRateLimited,
  API_RATE_LIMIT,
} from "@/lib/apiAuth";
import { isEntitled } from "@/lib/entitlement";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/products — list the authenticated key's org catalog.
 * Auth: Authorization: Bearer <api key>.
 * Scope: product:read.
 */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (isApiIpRateLimited(auth)) return apiRateLimited(auth.retryAfter);
  if (!auth) return apiUnauthorized();
  if (!isEntitled(auth.entitlement)) return apiTrialEnded(auth.entitlement);
  if (!auth.hasScope("product:read")) return apiMissingScope("product:read");

  const rl = await rateLimit(
    `api:${auth.keyId}`,
    API_RATE_LIMIT.max,
    API_RATE_LIMIT.windowSeconds
  );
  if (!rl.allowed) return apiRateLimited(rl.retryAfter);

  const url = new URL(req.url);
  const limit = Math.min(
    Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1),
    500
  );

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("products")
    .select("id, name, barcode, internal_sku, reorder_point, unit_cost")
    .eq("org_id", auth.orgId)
    .order("name", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[api/v1/products] query failed:", error.message);
    return Response.json({ error: "Internal error" }, { status: 500 });
  }

  return Response.json({ data: data ?? [] });
}
