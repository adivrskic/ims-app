import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * FEFO (first-expired, first-out) lot guidance for picking.
 *
 * Lots aren't tracked at the slot level — the lot registry (app.lots) knows
 * product + expiry, and per-lot on-hand is DERIVED the same way the lots page
 * derives it: received into the lot (po_line_items.quantity_received) minus
 * picked out of it (order_items.quantity_picked). For each lot-tracked
 * product this module suggests the lot to draw from next: earliest expiry
 * first (never-expiring lots last, oldest received first as the tiebreak),
 * skipping lots with nothing left.
 *
 * v1 is GUIDANCE — surfaced on the wave detail and the printed pick list so
 * the picker grabs the right stock. It does not stamp order_items.lot_id;
 * the physical scan-pick (mobile) still owns that write.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export interface FefoSuggestion {
  lotId: string;
  lotNumber: string;
  expiresAt: string | null;
  /** Derived units still attributed to this lot (received − picked). */
  remaining: number;
}

/**
 * FEFO ordering: earliest expiry first; never-expiring lots after every
 * dated one, oldest receipt first among themselves (FIFO fallback so
 * undated stock still rotates). Pure — unit-tested.
 */
export function compareFefo(
  a: { expires_at: string | null; received_at: string | null },
  b: { expires_at: string | null; received_at: string | null }
): number {
  if (a.expires_at && b.expires_at) {
    return a.expires_at.localeCompare(b.expires_at);
  }
  if (a.expires_at) return -1;
  if (b.expires_at) return 1;
  return (a.received_at ?? "").localeCompare(b.received_at ?? "");
}

/**
 * Earliest-expiring lot with remaining stock, per lot-tracked product.
 * Products that aren't lot-tracked (or have no live lots) simply have no
 * entry in the returned map.
 */
export async function fefoLotSuggestions(
  supabase: Client,
  orgId: string,
  productIds: string[]
): Promise<Map<string, FefoSuggestion>> {
  const suggestions = new Map<string, FefoSuggestion>();
  const ids = [...new Set(productIds)].filter(Boolean);
  if (ids.length === 0) return suggestions;

  // Only lot-tracked products can have lots; narrow before pulling ledgers.
  const { data: tracked } = await supabase
    .from("products")
    .select("id")
    .eq("org_id", orgId)
    .eq("track_lots", true)
    .in("id", ids);
  const trackedIds = ((tracked ?? []) as Array<{ id: string }>).map(
    (t) => t.id
  );
  if (trackedIds.length === 0) return suggestions;

  const { data: lots } = await supabase
    .from("lots")
    .select("id, product_id, lot_number, expires_at, received_at")
    .eq("org_id", orgId)
    .in("product_id", trackedIds);
  const lotRows = (lots ?? []) as Array<{
    id: string;
    product_id: string;
    lot_number: string;
    expires_at: string | null;
    received_at: string | null;
  }>;
  if (lotRows.length === 0) return suggestions;

  // Per-lot remaining = received − picked (same ledger as the lots page).
  const lotIds = lotRows.map((l) => l.id);
  const [{ data: recvLines }, { data: pickLines }] = await Promise.all([
    supabase
      .from("po_line_items")
      .select("lot_id, quantity_received")
      .in("lot_id", lotIds),
    supabase
      .from("order_items")
      .select("lot_id, quantity_picked")
      .in("lot_id", lotIds),
  ]);

  const remainingByLot = new Map<string, number>();
  for (const r of (recvLines ?? []) as Array<{
    lot_id: string | null;
    quantity_received: number | null;
  }>) {
    if (!r.lot_id) continue;
    remainingByLot.set(
      r.lot_id,
      (remainingByLot.get(r.lot_id) ?? 0) + (r.quantity_received ?? 0)
    );
  }
  for (const p of (pickLines ?? []) as Array<{
    lot_id: string | null;
    quantity_picked: number | null;
  }>) {
    if (!p.lot_id) continue;
    remainingByLot.set(
      p.lot_id,
      (remainingByLot.get(p.lot_id) ?? 0) - (p.quantity_picked ?? 0)
    );
  }

  // FEFO order: expiring soonest first; lots without an expiry go last,
  // ordered by receipt age so the oldest stock still rotates out first.
  const byProduct = new Map<string, typeof lotRows>();
  for (const lot of lotRows) {
    if ((remainingByLot.get(lot.id) ?? 0) <= 0) continue;
    const arr = byProduct.get(lot.product_id);
    if (arr) arr.push(lot);
    else byProduct.set(lot.product_id, [lot]);
  }

  for (const [productId, productLots] of byProduct) {
    productLots.sort(compareFefo);
    const best = productLots[0];
    suggestions.set(productId, {
      lotId: best.id,
      lotNumber: best.lot_number,
      expiresAt: best.expires_at,
      remaining: remainingByLot.get(best.id) ?? 0,
    });
  }

  return suggestions;
}
