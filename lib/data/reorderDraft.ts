import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  economicOrderQty,
  recommendedOrderQuantity,
  reorderPoint as ropFormula,
} from "@/lib/replenishment";
import { productVelocities } from "@/lib/data/velocity";

/**
 * Shared reorder-PO drafting engine.
 *
 * Extracted from the `draftReorderPO` server action so the SAME math + grouping
 * + persistence is reused by:
 *   - the manual "Draft from low-stock" button (RLS client, real user)
 *   - the scheduled auto-draft cron (admin client, no user session)
 *
 * Pure of Next.js concerns (no redirect / revalidate) — callers handle those.
 * Every query filters org_id EXPLICITLY: redundant under the RLS client, but
 * REQUIRED under the admin client (RLS bypassed) per repo convention.
 */

// Matches the input shape lib/ai/narrate.ts#narratePoDraft expects, so the
// server action can pass narratePoDraft directly and the cron can pass an
// admin-client-based equivalent.
export interface PoNarrationLine {
  product_name: string;
  barcode: string;
  velocity: number;
  on_hand: number;
  reorder_point: number;
  lead_time_days: number;
  recommended_qty: number;
}
export type PoNarrator = (input: {
  lines: PoNarrationLine[];
}) => Promise<(string | null)[] | null>;

export interface DraftReorderResult {
  status: "no_low_stock" | "created";
  /** IDs of the purchase orders created, in creation order. */
  createdPoIds: string[];
  /** Number of supplier groups (== number of POs created). */
  supplierGroups: number;
  /** Total low-stock SKUs that drove the draft. */
  skuCount: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

type ProductRow = {
  id: string;
  name: string;
  barcode: string;
  reorder_point: number;
  safety_stock: number | null;
  lead_time_days: number | null;
  unit_cost: string | null;
  preferred_supplier_id: string | null;
  locations: Array<{ quantity: number | null }> | null;
  preferred_supplier:
    | { id: string; name: string; default_lead_time_days: number | null }
    | { id: string; name: string; default_lead_time_days: number | null }[]
    | null;
};

type RecommendedLine = {
  product_id: string;
  product_name: string;
  barcode: string;
  quantity_expected: number;
  unit_cost: string | null;
  velocity: number;
  rop: number;
  on_hand: number;
  lead_time_days: number;
  reorder_point: number;
};

type Group = {
  supplierId: string | null;
  supplierName: string;
  lines: RecommendedLine[];
};

export async function draftReorderPOs(opts: {
  supabase: Client;
  orgId: string;
  /** Stamped onto created POs. null for system/cron-generated drafts. */
  userId: string | null;
  /** Optional AI reasoning generator; null/omitted → lines persist with no reasoning. */
  narrate?: PoNarrator | null;
}): Promise<DraftReorderResult> {
  const { supabase, orgId, userId, narrate } = opts;

  const { data: warehouse } = await supabase
    .from("warehouses")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();

  const { data: products } = await supabase
    .from("products")
    .select(
      `id, name, barcode, reorder_point, safety_stock, lead_time_days,
       unit_cost, preferred_supplier_id,
       locations:locations ( quantity ),
       preferred_supplier:suppliers!products_preferred_supplier_id_fkey (
         id, name, default_lead_time_days
       )`
    )
    .eq("org_id", orgId)
    .gt("reorder_point", 0);

  const lowStock = ((products as ProductRow[]) ?? [])
    .map((p) => {
      const total = (p.locations ?? []).reduce(
        (s, l) => s + (l.quantity ?? 0),
        0
      );
      const supplier = Array.isArray(p.preferred_supplier)
        ? p.preferred_supplier[0]
        : p.preferred_supplier;
      return { ...p, total, supplier };
    })
    .filter((p) => p.total <= p.reorder_point);

  if (lowStock.length === 0) {
    return {
      status: "no_low_stock",
      createdPoIds: [],
      supplierGroups: 0,
      skuCount: 0,
    };
  }

  // One batched query summing pick + adjust over the velocity window.
  const productIds = lowStock.map((p) => p.id);
  const velocities = await productVelocities(supabase, { productIds });

  // Group by preferred supplier + compute recommendations.
  const groups = new Map<string, Group>();
  for (const item of lowStock) {
    const velocity = velocities.get(item.id) ?? 0;
    // Effective lead time: product override > supplier default > 7d fallback.
    const leadTimeDays =
      item.lead_time_days ?? item.supplier?.default_lead_time_days ?? 7;
    const safetyStock = item.safety_stock ?? 0;
    const rop = ropFormula({ velocity, leadTimeDays, safetyStock });
    const unitCostNum =
      item.unit_cost != null ? parseFloat(item.unit_cost) : null;
    const eoq = economicOrderQty({
      annualDemand: velocity * 365,
      unitCost: unitCostNum,
    });
    const orderQty = recommendedOrderQuantity({
      onHand: item.total,
      rop,
      velocity,
      leadTimeDays,
      eoq,
    });

    const key = item.supplier?.id ?? "__tbd__";
    const line: RecommendedLine = {
      product_id: item.id,
      product_name: item.name,
      barcode: item.barcode,
      quantity_expected: orderQty,
      unit_cost: item.unit_cost,
      velocity,
      rop,
      on_hand: item.total,
      lead_time_days: leadTimeDays,
      reorder_point: item.reorder_point,
    };
    const existing = groups.get(key);
    if (existing) {
      existing.lines.push(line);
    } else {
      groups.set(key, {
        supplierId: item.supplier?.id ?? null,
        supplierName: item.supplier?.name ?? "Supplier TBD",
        lines: [line],
      });
    }
  }

  const createdPoIds: string[] = [];

  for (const group of groups.values()) {
    const ropSummary = group.lines
      .slice(0, 3)
      .map(
        (l) =>
          `${l.product_name}: ${l.quantity_expected}u (ROP ${
            l.rop
          }, v=${l.velocity.toFixed(2)}/d)`
      )
      .join("; ");
    const truncationHint =
      group.lines.length > 3 ? ` (+${group.lines.length - 3} more)` : "";

    // Atomic per-org PO number via the shared app.next_document_number RPC —
    // the SAME counter (and params) the manual createPurchaseOrder path uses,
    // so auto-drafts and manual POs can never mint colliding PO-#### values.
    // Replaces the old read-max-then-increment, which was non-atomic, not
    // org-scoped, and never advanced the org_number_sequences counter.
    const { data: poNumber } = await supabase.rpc("next_document_number", {
      p_org_id: orgId,
      p_kind: "PO",
      p_prefix: "PO",
      p_pad: 0,
      p_start: 2049,
    });

    const { data: newPO, error: poErr } = await supabase
      .from("purchase_orders")
      .insert({
        org_id: orgId,
        warehouse_id: warehouse?.id,
        po_number: poNumber as string,
        supplier_id: group.supplierId,
        supplier_name: group.supplierName,
        status: "draft",
        notes: `Auto-drafted · ${group.lines.length} SKU${
          group.lines.length === 1 ? "" : "s"
        } · ${ropSummary}${truncationHint}`,
        created_by: userId,
      })
      .select("id")
      .single();

    if (poErr || !newPO) continue;
    createdPoIds.push(newPO.id);

    // AI narration is fail-open: a null return just means reasoning=null.
    const narrations = narrate
      ? await narrate({
          lines: group.lines.map((l) => ({
            product_name: l.product_name,
            barcode: l.barcode,
            velocity: Number(l.velocity.toFixed(2)),
            on_hand: l.on_hand,
            reorder_point: l.reorder_point,
            lead_time_days: l.lead_time_days,
            recommended_qty: l.quantity_expected,
          })),
        })
      : null;

    const lineRows = group.lines.map((l, i) => ({
      po_id: newPO.id,
      product_id: l.product_id,
      product_name: l.product_name,
      barcode: l.barcode,
      quantity_expected: l.quantity_expected,
      unit_cost: l.unit_cost, // snapshotted for historical cost analysis
      reasoning: narrations?.[i] || null,
    }));

    await supabase.from("po_line_items").insert(lineRows);
  }

  return {
    status: "created",
    createdPoIds,
    supplierGroups: groups.size,
    skuCount: lowStock.length,
  };
}
