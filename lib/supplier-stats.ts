/**
 * Supplier scorecard math.
 *
 * Pure functions over already-fetched PO + line item data. The caller is
 * responsible for the actual Supabase queries; this module only does the
 * aggregation so it can be unit-tested without a DB.
 */

export interface ScorecardPo {
  id: string;
  status:
    | "draft"
    | "sent"
    | "partially_received"
    | "fully_received"
    | "cancelled";
  expected_date: string | null; // YYYY-MM-DD
  sent_at: string | null;
  received_at: string | null;
  lines: ScorecardLine[];
}

export interface ScorecardLine {
  quantity_expected: number;
  quantity_received: number | null;
  unit_cost: string | number | null;
  landed_unit_cost: string | number | null;
}

export interface SupplierStats {
  /** Distinct POs in any state */
  totalPos: number;
  /** POs not yet fully_received or cancelled */
  openPos: number;
  /** POs that have been fully received */
  receivedPos: number;
  /** On-time %: received POs where received_at <= expected_date */
  onTimePct: number | null;
  /** Avg days from sent_at to received_at across fully-received POs */
  avgLeadTimeDays: number | null;
  /** Fill rate: sum(received) / sum(expected) across non-cancelled POs */
  fillRatePct: number | null;
  /** Total amount spent (landed_unit_cost preferred, else unit_cost) */
  totalSpend: number;
}

/**
 * Compute scorecard for a single supplier from a flat list of their POs.
 * `pos` should already be filtered to one supplier.
 */
export function computeSupplierStats(pos: ScorecardPo[]): SupplierStats {
  const nonCancelled = pos.filter((p) => p.status !== "cancelled");
  const received = pos.filter((p) => p.status === "fully_received");
  const open = pos.filter(
    (p) =>
      p.status === "draft" ||
      p.status === "sent" ||
      p.status === "partially_received"
  );

  // ─ On-time % ─────────────────────────────────────────────────────────────
  // Only meaningful when both `expected_date` and `received_at` exist for
  // received POs. Skip the rest of the divisor.
  const onTimeEligible = received.filter(
    (p) => p.expected_date && p.received_at
  );
  const onTimeHits = onTimeEligible.filter((p) => {
    // expected_date is YYYY-MM-DD (date), received_at is timestamptz.
    // Build a Date for end-of-expected-day and compare.
    const exp = new Date(p.expected_date + "T23:59:59");
    const recv = new Date(p.received_at!);
    return recv <= exp;
  }).length;
  const onTimePct =
    onTimeEligible.length > 0
      ? Math.round((onTimeHits / onTimeEligible.length) * 100)
      : null;

  // ─ Avg lead time ─────────────────────────────────────────────────────────
  // sent_at → received_at across fully received POs that have both timestamps.
  const leadEligible = received.filter((p) => p.sent_at && p.received_at);
  const leadDays = leadEligible.map((p) => {
    const sent = new Date(p.sent_at!).getTime();
    const recv = new Date(p.received_at!).getTime();
    return Math.max(0, (recv - sent) / 86_400_000);
  });
  const avgLeadTimeDays =
    leadDays.length > 0
      ? Math.round(
          (leadDays.reduce((a, b) => a + b, 0) / leadDays.length) * 10
        ) / 10
      : null;

  // ─ Fill rate ─────────────────────────────────────────────────────────────
  let totalExpected = 0;
  let totalReceived = 0;
  for (const po of nonCancelled) {
    for (const line of po.lines) {
      totalExpected += line.quantity_expected ?? 0;
      totalReceived += line.quantity_received ?? 0;
    }
  }
  const fillRatePct =
    totalExpected > 0
      ? Math.round((totalReceived / totalExpected) * 100)
      : null;

  // ─ Total spend ───────────────────────────────────────────────────────────
  // Use landed_unit_cost when present (truer cost), fall back to unit_cost.
  // Multiply by qty_received (what was actually delivered), not expected.
  let totalSpend = 0;
  for (const po of nonCancelled) {
    for (const line of po.lines) {
      const cost =
        coerceNum(line.landed_unit_cost) ?? coerceNum(line.unit_cost);
      if (cost == null) continue;
      const qty = line.quantity_received ?? 0;
      totalSpend += cost * qty;
    }
  }

  return {
    totalPos: pos.length,
    openPos: open.length,
    receivedPos: received.length,
    onTimePct,
    avgLeadTimeDays,
    fillRatePct,
    totalSpend: Math.round(totalSpend * 100) / 100,
  };
}

function coerceNum(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}
