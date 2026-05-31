import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Adjustment governance: reason codes + an approval queue for large manual
 * stock adjustments.
 *
 *   - Reason codes (`adjustment_reasons`) are an org-managed controlled
 *     vocabulary captured on every adjustment (cycle count + manual edit).
 *   - A manual adjustment is gated when its magnitude exceeds the org's
 *     `adjustment_approval_threshold`, or the chosen reason requires approval:
 *     instead of committing, it queues a `stock_adjustment_requests` row for an
 *     admin to approve (commit) or reject.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

export interface AdjustmentReason {
  id: string;
  code: string;
  label: string;
  requiresApproval: boolean;
  isActive: boolean;
  sortOrder: number;
}

/** Sensible starter set, offered when an org has no reasons configured. */
export const DEFAULT_REASONS: Array<{
  code: string;
  label: string;
  requires_approval: boolean;
}> = [
  { code: "cycle_count", label: "Cycle count correction", requires_approval: false },
  { code: "damage", label: "Damaged / unsellable", requires_approval: false },
  { code: "shrinkage", label: "Shrinkage / loss", requires_approval: true },
  { code: "theft", label: "Theft", requires_approval: true },
  { code: "found", label: "Found stock", requires_approval: false },
  { code: "expiry", label: "Expired", requires_approval: false },
  { code: "sample", label: "Sample / giveaway", requires_approval: false },
  { code: "receiving_error", label: "Receiving error", requires_approval: false },
];

export async function getReasons(
  supabase: Client,
  orgId: string,
  activeOnly = false
): Promise<AdjustmentReason[]> {
  let q = supabase
    .from("adjustment_reasons")
    .select("id, code, label, requires_approval, is_active, sort_order")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: true })
    .order("label", { ascending: true });
  if (activeOnly) q = q.eq("is_active", true);
  const { data } = await q;
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    label: r.label as string,
    requiresApproval: Boolean(r.requires_approval),
    isActive: Boolean(r.is_active),
    sortOrder: (r.sort_order as number) ?? 0,
  }));
}

export interface PendingAdjustment {
  id: string;
  productId: string | null;
  productName: string;
  warehouseName: string | null;
  slotLabel: string | null;
  currentQty: number;
  requestedQty: number;
  delta: number;
  reasonCode: string | null;
  reasonLabel: string | null;
  notes: string | null;
  requestedAt: string | null;
}

export async function getPendingAdjustments(
  supabase: Client,
  orgId: string,
  warehouseId: string | null
): Promise<PendingAdjustment[]> {
  let q = supabase
    .from("stock_adjustment_requests")
    .select(
      "id, product_id, warehouse_id, current_qty, requested_qty, delta, reason_code, notes, created_at, product:products ( name ), warehouse:warehouses ( name ), location:locations ( bay, level, section:sections ( code ) )"
    )
    .eq("org_id", orgId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  if (warehouseId) q = q.eq("warehouse_id", warehouseId);
  const { data } = await q;

  // Resolve reason labels.
  const reasons = await getReasons(supabase, orgId);
  const labelByCode = new Map(reasons.map((r) => [r.code, r.label]));

  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => {
    const product = oneOf(r.product) as { name: string | null } | null;
    const warehouse = oneOf(r.warehouse) as { name: string | null } | null;
    const loc = oneOf(r.location) as
      | { bay: number | null; level: number | null; section: unknown }
      | null;
    const section = loc ? (oneOf(loc.section) as { code: string | null } | null) : null;
    const slotLabel =
      loc && section?.code
        ? `${section.code}-${String(loc.bay ?? 0).padStart(2, "0")}-${loc.level ?? 0}`
        : null;
    const reasonCode = (r.reason_code as string | null) ?? null;
    return {
      id: r.id as string,
      productId: (r.product_id as string | null) ?? null,
      productName: product?.name ?? "Unknown product",
      warehouseName: warehouse?.name ?? null,
      slotLabel,
      currentQty: r.current_qty as number,
      requestedQty: r.requested_qty as number,
      delta: r.delta as number,
      reasonCode,
      reasonLabel: reasonCode ? labelByCode.get(reasonCode) ?? reasonCode : null,
      notes: (r.notes as string | null) ?? null,
      requestedAt: (r.created_at as string | null) ?? null,
    };
  });
}

export async function getPendingAdjustmentCount(
  supabase: Client,
  orgId: string
): Promise<number> {
  const { count } = await supabase
    .from("stock_adjustment_requests")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("status", "pending");
  return count ?? 0;
}

// ── Mutations ──────────────────────────────────────────────────────────────

export interface AdjustResult {
  committed?: boolean;
  queued?: boolean;
  noop?: boolean;
  error?: string;
}

interface AdjustArgs {
  locationId: string;
  warehouseId: string | null;
  productId: string | null;
  currentQty: number;
  requestedQty: number;
  reasonCode: string | null;
  notes?: string | null;
}

/** Commit a stock adjustment: write the new qty + an audited scan_history row. */
async function commitAdjustment(
  supabase: Client,
  ctx: { orgId: string; userId: string },
  a: AdjustArgs
): Promise<void> {
  const delta = a.requestedQty - a.currentQty;
  await supabase
    .from("locations")
    .update({ quantity: a.requestedQty })
    .eq("id", a.locationId)
    .eq("org_id", ctx.orgId);
  await supabase.from("scan_history").insert({
    org_id: ctx.orgId,
    product_id: a.productId,
    warehouse_id: a.warehouseId,
    scanned_by: ctx.userId,
    action: "adjust",
    quantity: delta,
    reason_code: a.reasonCode,
    notes: a.notes ?? null,
  });
}

/**
 * Apply a manual adjustment, or queue it for approval when its magnitude
 * exceeds the org threshold or the chosen reason requires approval.
 */
export async function applyOrQueueAdjustment(
  supabase: Client,
  ctx: { orgId: string; userId: string },
  a: AdjustArgs
): Promise<AdjustResult> {
  const delta = a.requestedQty - a.currentQty;
  if (delta === 0) return { noop: true };

  // Resolve gating inputs: org threshold + whether the reason requires approval.
  const [{ data: org }, reasonRow] = await Promise.all([
    supabase
      .from("orgs")
      .select("adjustment_approval_threshold")
      .eq("id", ctx.orgId)
      .maybeSingle(),
    a.reasonCode
      ? supabase
          .from("adjustment_reasons")
          .select("requires_approval")
          .eq("org_id", ctx.orgId)
          .eq("code", a.reasonCode)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const threshold =
    (org as { adjustment_approval_threshold: number | null } | null)
      ?.adjustment_approval_threshold ?? null;
  const reasonRequiresApproval = Boolean(
    (reasonRow as { data: { requires_approval: boolean } | null } | null)?.data
      ?.requires_approval
  );

  const needsApproval =
    (threshold != null && Math.abs(delta) > threshold) || reasonRequiresApproval;

  if (needsApproval) {
    const { error } = await supabase.from("stock_adjustment_requests").insert({
      org_id: ctx.orgId,
      warehouse_id: a.warehouseId,
      location_id: a.locationId,
      product_id: a.productId,
      current_qty: a.currentQty,
      requested_qty: a.requestedQty,
      delta,
      reason_code: a.reasonCode,
      notes: a.notes ?? null,
      requested_by: ctx.userId,
    });
    if (error) return { error: error.message };
    return { queued: true };
  }

  await commitAdjustment(supabase, ctx, a);
  return { committed: true };
}

/** Approve a queued adjustment → commit the stock change. */
export async function approveAdjustmentInternal(
  supabase: Client,
  ctx: { orgId: string; userId: string },
  requestId: string
): Promise<{ error?: string; productId?: string | null }> {
  const { data: req } = await supabase
    .from("stock_adjustment_requests")
    .select(
      "id, status, location_id, warehouse_id, product_id, current_qty, requested_qty, reason_code, notes"
    )
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!req) return { error: "Request not found" };
  const r = req as Record<string, unknown>;
  if (r.status !== "pending") return { error: "Already reviewed" };
  if (!r.location_id) return { error: "Location no longer exists" };

  // Re-read the live qty so an approval applies the intended FINAL qty even if
  // on-hand drifted since the request (the request captured a target qty).
  await commitAdjustment(supabase, ctx, {
    locationId: r.location_id as string,
    warehouseId: (r.warehouse_id as string | null) ?? null,
    productId: (r.product_id as string | null) ?? null,
    currentQty: r.current_qty as number,
    requestedQty: r.requested_qty as number,
    reasonCode: (r.reason_code as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
  });

  await supabase
    .from("stock_adjustment_requests")
    .update({
      status: "approved",
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId);

  return { productId: (r.product_id as string | null) ?? null };
}

export async function rejectAdjustmentInternal(
  supabase: Client,
  ctx: { orgId: string; userId: string },
  requestId: string
): Promise<void> {
  await supabase
    .from("stock_adjustment_requests")
    .update({
      status: "rejected",
      reviewed_by: ctx.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .eq("org_id", ctx.orgId)
    .eq("status", "pending");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function oneOf(v: any): any {
  return Array.isArray(v) ? v[0] ?? null : v ?? null;
}
