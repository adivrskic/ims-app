import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateApiKey,
  apiUnauthorized,
  apiRateLimited,
  API_RATE_LIMIT,
} from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/products — list the authenticated key's org catalog.
 * Auth: Authorization: Bearer <api key>.
 */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return apiUnauthorized();

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
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ data: data ?? [] });
}
