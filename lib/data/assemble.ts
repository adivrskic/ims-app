import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared kit-assembly primitive: consume a kit's components from on-hand at a
 * facility and produce the finished good. Used by both the quick "Build kit"
 * action and work-order completion.
 *
 * MULTI-LEVEL: the `app.assemble_kit` RPC explodes the BOM recursively. Each
 * direct component is consumed from on-hand when available (so a pre-built
 * sub-assembly in stock is used as-is); any shortfall of a component that is
 * itself a kit is built from ITS components, down to raw leaves. The whole
 * consume-and-produce runs in one transaction, serialized per facility by an
 * advisory lock, so concurrent builds can't read stale on-hand and a shortfall
 * with no BOM rolls the entire build back. Every leg is written to scan_history.
 *
 * `consumed` (returned) is keyed by DIRECT component → units required, matching
 * the work_order_lines snapshot; sub-assembly explosion is internal.
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

  const { data, error } = await supabase.rpc("assemble_kit", {
    p_org_id: ctx.orgId,
    p_warehouse_id: warehouseId,
    p_kit_id: kitId,
    p_qty: qty,
    p_reason: reason,
  });
  if (error) return { error: error.message };

  return parseAssembleResult(data);
}

/** Shape returned by the assemble_kit / complete_work_order RPCs. */
export function parseAssembleResult(data: unknown): AssembleResult {
  const obj = (data ?? {}) as {
    consumed?: Record<string, number>;
    produced_qty?: number;
  };
  const consumed = new Map<string, number>();
  for (const [pid, n] of Object.entries(obj.consumed ?? {})) {
    consumed.set(pid, Number(n));
  }
  return { consumed, producedQty: obj.produced_qty ?? undefined };
}
