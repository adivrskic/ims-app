import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared kit-assembly primitive: consume a kit's DIRECT components from on-hand
 * at a facility and produce the finished good. Used by both the quick "Build
 * kit" action and work-order completion.
 *
 * Direct-component model: sub-assemblies are consumed as built units (build them
 * via their own work order first). On-hand is adjusted at the location level
 * (greedy decrement across the product's slots) and every leg is written to
 * scan_history for auditability. Validates sufficiency before mutating.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export interface AssembleResult {
  error?: string;
  /** componentProductId → units consumed. */
  consumed?: Map<string, number>;
  producedQty?: number;
}

export async function assembleKit(
  supabase: Client,
  ctx: { orgId: string; userId: string },
  args: { kitId: string; warehouseId: string; qty: number; reason: string }
): Promise<AssembleResult> {
  const { kitId, warehouseId, qty, reason } = args;
  if (!Number.isFinite(qty) || qty <= 0) {
    return { error: "Quantity must be a positive number" };
  }

  const { data: comps } = await supabase
    .from("kit_components")
    .select("component_product_id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("kit_product_id", kitId);
  const components = (comps ?? []) as Array<{
    component_product_id: string;
    quantity: number;
  }>;
  if (components.length === 0) {
    return { error: "Define the kit's bill of materials first" };
  }

  const productIds = [kitId, ...components.map((c) => c.component_product_id)];
  const { data: locData } = await supabase
    .from("locations")
    .select("id, product_id, quantity")
    .eq("org_id", ctx.orgId)
    .eq("warehouse_id", warehouseId)
    .in("product_id", productIds);
  type Loc = { id: string; product_id: string | null; quantity: number | null };
  const locs = (locData ?? []) as Loc[];

  const locsByProduct = new Map<string, Loc[]>();
  for (const l of locs) {
    if (!l.product_id) continue;
    const arr = locsByProduct.get(l.product_id) ?? [];
    arr.push(l);
    locsByProduct.set(l.product_id, arr);
  }
  const onHand = (pid: string) =>
    (locsByProduct.get(pid) ?? []).reduce((s, l) => s + (l.quantity ?? 0), 0);

  // Validate sufficiency of every component before any mutation.
  for (const c of components) {
    if (onHand(c.component_product_id) < c.quantity * qty) {
      return {
        error: `Not enough stock at this facility to build ${qty} — short on a component.`,
      };
    }
  }

  const consumed = new Map<string, number>();

  // Consume components (greedy decrement across the product's locations).
  for (const c of components) {
    const need = c.quantity * qty;
    let remaining = need;
    const rows = (locsByProduct.get(c.component_product_id) ?? []).sort(
      (a, b) => (b.quantity ?? 0) - (a.quantity ?? 0)
    );
    for (const row of rows) {
      if (remaining <= 0) break;
      const have = row.quantity ?? 0;
      const take = Math.min(have, remaining);
      if (take <= 0) continue;
      await supabase
        .from("locations")
        .update({ quantity: have - take })
        .eq("id", row.id);
      remaining -= take;
    }
    consumed.set(c.component_product_id, need);
    await supabase.from("scan_history").insert({
      org_id: ctx.orgId,
      product_id: c.component_product_id,
      warehouse_id: warehouseId,
      scanned_by: ctx.userId,
      action: "adjust",
      quantity: -need,
      notes: `${reason}: consumed for ${qty}× build`,
    });
  }

  // Produce the finished good: increment an existing location or stage one.
  const kitLocs = locsByProduct.get(kitId) ?? [];
  if (kitLocs[0]) {
    await supabase
      .from("locations")
      .update({ quantity: (kitLocs[0].quantity ?? 0) + qty })
      .eq("id", kitLocs[0].id);
  } else {
    await supabase.from("locations").insert({
      org_id: ctx.orgId,
      product_id: kitId,
      warehouse_id: warehouseId,
      section_id: null,
      bay: 0,
      level: 0,
      quantity: qty,
      placed_by: ctx.userId,
    });
  }
  await supabase.from("scan_history").insert({
    org_id: ctx.orgId,
    product_id: kitId,
    warehouse_id: warehouseId,
    scanned_by: ctx.userId,
    action: "adjust",
    quantity: qty,
    notes: `${reason}: assembled ${qty} unit${qty === 1 ? "" : "s"}`,
  });

  return { consumed, producedQty: qty };
}
