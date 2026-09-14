import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateApiKey,
  apiUnauthorized,
  apiTrialEnded,
  apiMissingScope,
  apiRateLimited,
  API_RATE_LIMIT,
} from "@/lib/apiAuth";
import { isEntitled } from "@/lib/entitlement";
import { rateLimit } from "@/lib/rateLimit";
import { fetchAllPaged } from "@/lib/data/paginate";

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
  if (!isEntitled(auth.entitlement)) return apiTrialEnded(auth.entitlement);
  if (!auth.hasScope("location:read")) return apiMissingScope("location:read");

  const rl = await rateLimit(
    `api:${auth.keyId}`,
    API_RATE_LIMIT.max,
    API_RATE_LIMIT.windowSeconds
  );
  if (!rl.allowed) return apiRateLimited(rl.retryAfter);

  const warehouseId = new URL(req.url).searchParams.get("warehouse_id");
  const admin = createAdminClient();

  // Paginate: a single .select() stops at PostgREST's ~1000-row cap, so any
  // org with more location rows than that got totals that were quietly too
  // low — wrong numbers on a public contract. Ordered by id so the pages can't
  // overlap or skip. Admin client bypasses RLS, hence the explicit org_id.
  let rows: Array<{ product_id: string | null; quantity: number | null }>;
  try {
    rows = await fetchAllPaged<{
      product_id: string | null;
      quantity: number | null;
    }>((from, to) => {
      let q = admin
        .from("locations")
        .select("product_id, quantity")
        .eq("org_id", auth.orgId)
        .eq("is_active", true)
        .eq("quarantined", false)
        .order("id", { ascending: true });
      if (warehouseId) q = q.eq("warehouse_id", warehouseId);
      return q.range(from, to).throwOnError();
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "Query failed" },
      { status: 500 }
    );
  }

  const onHand = new Map<string, number>();
  for (const l of rows) {
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
