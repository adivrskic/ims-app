/**
 * Cycle-count prioritization — "what should we count next?"
 *
 * Pure functions, no DB access, no side effects (mirrors lib/replenishment).
 * Scores how likely a product is to be holding an undetected inventory
 * discrepancy, so the cycle-counts page can float the riskiest SKUs to the top
 * of a "count next" list.
 *
 * The score blends four signals, all derived from a product's count history
 * plus its demand velocity:
 *
 *   1. miscount rate   — how OFTEN past counts found a variance
 *   2. relative error  — how BADLY off it tends to be, as a fraction of the
 *                        quantity on the shelf (normalizes big vs small SKUs)
 *   3. staleness       — how long since the last count (drift accumulates)
 *   4. velocity        — fast movers accrue error faster and cost more when off
 *
 * This is a heuristic, not a calibrated model. The absolute number is
 * meaningless — only the RANKING matters — so tune the weights freely. A
 * product whose every count has been accurate scores ~0 and sinks to the
 * bottom; a frequently-wrong, fast-moving, long-uncounted SKU rises to the top.
 */

// Staleness ramps roughly one "unit" per month since the last count, capped so
// an ancient count doesn't dominate every other signal.
const STALENESS_RAMP_DAYS = 30;
const STALENESS_CAP = 3;

// Baseline risk for a product that has never been counted at all — enough to
// keep it visible (especially if it's a fast mover) without outranking a SKU
// with a proven discrepancy history.
const NEVER_COUNTED_BASE = 0.2;

export interface CountRecord {
  /** Signed variance: counted_qty − expected_qty. */
  variance: number;
  /** What the system thought was on the shelf at count time. */
  expectedQty: number;
  /** ISO timestamp of the count. */
  countedAt: string;
}

export interface CycleRiskInput {
  history: CountRecord[];
  /** Units/day from lib/data/velocity. Defaults to 0 (no demand signal). */
  velocity?: number;
  /** Injectable for tests; defaults to now. */
  now?: Date;
}

export interface CycleRiskScore {
  /** Higher = count sooner. 0 means no discrepancy signal. */
  score: number;
  miscountRate: number;
  avgAbsVariance: number;
  relativeError: number;
  daysSinceLastCount: number | null;
  countsConsidered: number;
  /** Short human-readable explanation for the UI. */
  reason: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function cycleRiskScore({
  history,
  velocity = 0,
  now = new Date(),
}: CycleRiskInput): CycleRiskScore {
  const counts = history.length;

  // Fast movers matter more, but log-dampened so a 100/day SKU doesn't outweigh
  // every accuracy signal. velocity 0 → weight 1 (no effect).
  const velocityWeight = 1 + Math.log1p(Math.max(0, velocity));

  if (counts === 0) {
    const score = NEVER_COUNTED_BASE * velocityWeight * 100;
    return {
      score,
      miscountRate: 0,
      avgAbsVariance: 0,
      relativeError: 0,
      daysSinceLastCount: null,
      countsConsidered: 0,
      reason: velocity > 0 ? "never counted · moving stock" : "never counted",
    };
  }

  const withVariance = history.filter((h) => h.variance !== 0).length;
  const miscountRate = withVariance / counts;

  const avgAbsVariance =
    history.reduce((s, h) => s + Math.abs(h.variance), 0) / counts;
  const avgExpected =
    history.reduce((s, h) => s + Math.max(0, h.expectedQty), 0) / counts;
  // Error as a fraction of typical on-shelf qty, capped at 1 (100% off).
  const relativeError = Math.min(1, avgAbsVariance / (avgExpected + 1));

  const lastCountedMs = history.reduce(
    (max, h) => Math.max(max, new Date(h.countedAt).getTime()),
    0
  );
  const daysSinceLastCount = Math.max(
    0,
    Math.floor((now.getTime() - lastCountedMs) / DAY_MS)
  );
  const recencyWeight =
    1 + Math.min(daysSinceLastCount / STALENESS_RAMP_DAYS, STALENESS_CAP);

  // base: how often AND how badly it's been wrong. Accurate history → 0.
  const base = miscountRate * relativeError;
  const score = base * velocityWeight * recencyWeight * 100;

  const bits: string[] = [];
  if (withVariance > 0) bits.push(`off on ${withVariance}/${counts} counts`);
  if (relativeError >= 0.05)
    bits.push(`~${Math.round(relativeError * 100)}% avg error`);
  if (daysSinceLastCount >= STALENESS_RAMP_DAYS)
    bits.push(`${daysSinceLastCount}d since last count`);
  if (velocity > 0 && velocityWeight >= 1.4) bits.push("fast mover");

  return {
    score,
    miscountRate,
    avgAbsVariance,
    relativeError,
    daysSinceLastCount,
    countsConsidered: counts,
    reason: bits.length ? bits.join(" · ") : "stable history",
  };
}
