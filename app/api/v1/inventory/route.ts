import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateApiKey,
  apiUnauthorized,
  apiMissingScope,
  apiRateLimited,
  API_RATE_LIMIT,
} from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

/**
 * GET /api/v1/inventory — on-hand totals per product for the key's org.
 * Optional ?warehouse_id= to scope to one facility.
 * Auth: Authorization: Bearer <api key>.
 * Scope: location:read — the figures are summed from `locations`.
 */
export async function GET(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return apiUnauthorized();
  if (!auth.hasScope("location:read")) return apiMissingScope("location:read");

  const rl = await rateLimit(
    `api:${auth.keyId}`,
    API_RATE_LIMIT.max,
    API_RATE_LIMIT.windowSeconds
  );
  if (!rl.allowed) return apiRateLimited(rl.retryAfter);

  const warehouseId = new URL(req.url).searchParams.get("warehouse_id");
  const admin = createAdminClient();

  let q = admin
    .from("locations")
    .select("product_id, quantity")
    .eq("org_id", auth.orgId)
    .eq("is_active", true)
    .eq("quarantined", false);
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data, error } = await q;

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const onHand = new Map<string, number>();
  for (const l of (data ?? []) as Array<{
    product_id: string | null;
    quantity: number | null;
  }>) {
    if (!l.product_id) continue;
    onHand.set(
      l.product_id,
      (onHand.get(l.product_id) ?? 0) + (l.quantity ?? 0)
    );
  }

  return Response.json({
    data: [...onHand.entries()].map(([product_id, on_hand]) => ({
      product_id,
      on_hand,
    })),
  });
}
