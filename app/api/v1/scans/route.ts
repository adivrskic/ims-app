import { createAdminClient } from "@/lib/supabase/admin";
import {
  authenticateApiKey,
  apiUnauthorized,
  apiForbidden,
  apiRateLimited,
  API_RATE_LIMIT,
} from "@/lib/apiAuth";
import { rateLimit } from "@/lib/rateLimit";

export const dynamic = "force-dynamic";

const ALLOWED_ACTIONS = new Set([
  "locate",
  "pick",
  "receive",
  "return",
  "adjust",
  "putaway",
  "transfer",
]);

/**
 * POST /api/v1/scans — log a scan event for the key's org.
 *
 * RBAC: requires the key's issuing identity to hold `inventory.adjust` — this
 * is the demonstration that API keys inherit their creator's permissions (a key
 * whose issuer can't adjust inventory gets a 403, not a 200).
 *
 * Body: { product_id, warehouse_id?, action?, quantity?, notes? }
 */
export async function POST(req: Request) {
  const auth = await authenticateApiKey(req);
  if (!auth) return apiUnauthorized();
  if (!auth.can("inventory.adjust")) return apiForbidden("inventory.adjust");

  const rl = await rateLimit(
    `api:${auth.keyId}`,
    API_RATE_LIMIT.max,
    API_RATE_LIMIT.windowSeconds
  );
  if (!rl.allowed) return apiRateLimited(rl.retryAfter);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = String(body.product_id ?? "").trim();
  const warehouseId = body.warehouse_id
    ? String(body.warehouse_id).trim()
    : null;
  const action = String(body.action ?? "locate").trim();
  const quantity = Number.isFinite(Number(body.quantity))
    ? Math.trunc(Number(body.quantity))
    : 0;
  const notes = body.notes ? String(body.notes).slice(0, 500) : null;

  if (!productId) {
    return Response.json({ error: "product_id is required" }, { status: 400 });
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    return Response.json({ error: `Unsupported action: ${action}` }, {
      status: 400,
    });
  }
  // Bound the magnitude: velocity/forecast sum abs(quantity) over pick+adjust, so
  // an unbounded value would let a caller arbitrarily inflate reorder points and
  // auto-drafted POs. A single scan of >1e6 units is not a real movement.
  const MAX_SCAN_QTY = 1_000_000;
  if (Math.abs(quantity) > MAX_SCAN_QTY) {
    return Response.json(
      { error: `quantity out of range (±${MAX_SCAN_QTY})` },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Validate the product belongs to the key's org.
  const { data: product } = await admin
    .from("products")
    .select("id")
    .eq("id", productId)
    .eq("org_id", auth.orgId)
    .maybeSingle();
  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  // If a warehouse is supplied, it must belong to the key's org too — otherwise
  // a caller could stamp another org's warehouse UUID onto their scan row.
  if (warehouseId) {
    const { data: wh } = await admin
      .from("warehouses")
      .select("id")
      .eq("id", warehouseId)
      .eq("org_id", auth.orgId)
      .maybeSingle();
    if (!wh) {
      return Response.json({ error: "Warehouse not found" }, { status: 404 });
    }
  }

  const { data: scan, error } = await admin
    .from("scan_history")
    .insert({
      org_id: auth.orgId,
      product_id: productId,
      warehouse_id: warehouseId,
      scanned_by: auth.userId,
      action,
      quantity,
      notes,
    })
    .select("id")
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ data: { id: scan.id } }, { status: 201 });
}
