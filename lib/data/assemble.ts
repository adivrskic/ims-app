import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Shared kit-assembly primitive: consume a kit's DIRECT components from on-hand
 * at a facility and produce the finished good. Used by both the quick "Build
 * kit" action and work-order completion.
 *
 * Direct-component model: sub-assemblies are consumed as built units (build them
 * via their own work order first). The entire consume-and-produce runs inside
 * the `app.assemble_kit` RPC, which locks the relevant location rows FOR UPDATE
 * and validates sufficiency against live (post-lock) on-hand — so two concurrent
 * builds can't both pass validation and drive stock negative. Every leg is still
 * written to scan_history for auditability.
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
