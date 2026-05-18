/**
 * Replenishment math.
 *
 * Pure functions — no DB access, no side effects. Lives in lib/ so it can be
 * called from server actions (draftReorderPO) and surfaced in the UI
 * (product detail "recommended order qty" hint).
 *
 * Industry defaults baked in:
 *   - DEFAULT_ORDER_COST       = $25   (typical cost-per-PO for SMB ops:
 *                                       buyer time, paperwork, EDI fees)
 *   - DEFAULT_HOLDING_COST_PCT = 0.25  (25% of unit value per year — standard
 *                                       carrying-cost rule of thumb covering
 *                                       capital, warehousing, shrink)
 *
 * Callers can override either when better numbers are available (e.g. a
 * supplier-specific PO fee).
 */

export const DEFAULT_ORDER_COST = 25;
export const DEFAULT_HOLDING_COST_PCT = 0.25;

// ─── Velocity ───────────────────────────────────────────────────────────────

/**
 * Average daily pick rate for a product over a lookback window.
 *
 * Sums the absolute quantity from `pick` and `adjust` scans (adjustments
 * include shrinkage / damage) over `days`, then divides by `days`.
 *
 * Returns 0 when there's no data — callers should treat that as "no demand
 * signal yet" rather than "we know demand is zero".
 */
export function dailyVelocity({
  totalUnitsConsumed,
  days,
}: {
  totalUnitsConsumed: number;
  days: number;
}): number {
  if (days <= 0) return 0;
  return Math.max(0, totalUnitsConsumed) / days;
}

// ─── Reorder Point ──────────────────────────────────────────────────────────

/**
 * The on-hand level at which a reorder should be triggered.
 *
 *   ROP = (avg daily demand × lead time in days) + safety stock
 *
 * This is the textbook formula. It assumes constant demand and lead time;
 * the safety_stock term absorbs variability. Production-grade WMS systems
 * use service-level math (z × σ × √LT) instead — out of scope for P2.
 */
export function reorderPoint({
  velocity,
  leadTimeDays,
  safetyStock,
}: {
  velocity: number;
  leadTimeDays: number;
  safetyStock: number;
}): number {
  if (velocity <= 0 || leadTimeDays <= 0) {
    return Math.max(0, safetyStock);
  }
  return Math.ceil(velocity * leadTimeDays + Math.max(0, safetyStock));
}

// ─── EOQ ────────────────────────────────────────────────────────────────────

/**
 * Economic Order Quantity — the order size that minimises total
 * (order + holding) cost.
 *
 *   EOQ = √( (2 × annualDemand × orderCost) / holdingCostPerUnit )
 *
 * `holdingCostPerUnit` is the annual cost to keep one unit on the shelf
 * — typically a percentage of the unit's value. If `unitCost` is provided
 * we'll derive it via DEFAULT_HOLDING_COST_PCT.
 *
 * Returns null when we don't have enough data (no demand or no cost). The
 * caller should fall back to a heuristic (e.g. reorder_point × 2).
 */
export function economicOrderQty({
  annualDemand,
  orderCost = DEFAULT_ORDER_COST,
  holdingCostPerUnit,
  unitCost,
  holdingCostPct = DEFAULT_HOLDING_COST_PCT,
}: {
  annualDemand: number;
  orderCost?: number;
  holdingCostPerUnit?: number;
  unitCost?: number | null;
  holdingCostPct?: number;
}): number | null {
  if (annualDemand <= 0) return null;

  const h =
    holdingCostPerUnit ??
    (unitCost != null && unitCost > 0 ? unitCost * holdingCostPct : null);

  if (h == null || h <= 0) return null;

  return Math.max(1, Math.ceil(Math.sqrt((2 * annualDemand * orderCost) / h)));
}

// ─── Composite: recommend an order quantity ─────────────────────────────────

/**
 * Recommended order quantity given everything we know.
 *
 * Logic:
 *   1. The amount we need just to get back above ROP after lead time:
 *      gap = max(0, ROP + (velocity × leadTime) - onHand)
 *   2. The economically efficient batch size: EOQ
 *   3. Return max(gap, EOQ) — order at least the EOQ even if the gap is
 *      small, and at least the gap even if the EOQ is small.
 *
 * When EOQ can't be computed (no cost or no demand), fall back to the
 * conservative `gap` only — or, if that's also zero, return null so the
 * caller can decide whether to draft a PO at all.
 */
export function recommendedOrderQuantity({
  onHand,
  rop,
  velocity,
  leadTimeDays,
  eoq,
}: {
  onHand: number;
  rop: number;
  velocity: number;
  leadTimeDays: number;
  eoq: number | null;
}): number {
  // How far below ROP are we, factoring in the demand that'll happen
  // during the next lead time window?
  const lookaheadDemand = Math.max(0, velocity * Math.max(0, leadTimeDays));
  const gap = Math.max(
    0,
    Math.ceil(rop + lookaheadDemand - Math.max(0, onHand))
  );

  if (eoq != null && eoq > 0) {
    return Math.max(gap, eoq);
  }

  // Fallback: at least bring stock back to ROP × 2 (the old naive math)
  if (gap === 0) {
    return Math.max(1, Math.ceil(rop));
  }
  return Math.max(gap, Math.ceil(rop));
}
