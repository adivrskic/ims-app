/**
 * Shared helpers for dashboard / analytics pages.
 *
 * P0: bucketByDay + deltaVsPrior7dAvg (scan trend)
 * P1: snapshotsAsSpark + snapshotDelta + formatCurrency (inventory snapshots)
 */

import type { InventorySnapshotRow } from "@/types/db";

export interface DeltaResult {
  value: string;
  direction: "up" | "down" | "flat";
  tone: "good" | "bad" | "neutral";
}

// ─── Scan trend helpers (P0) ────────────────────────────────────────────────

/**
 * Drop a list of scan timestamps into 14 daily buckets, oldest first.
 * buckets[13] = today, buckets[12] = yesterday, etc.
 */
export function bucketByDay(scans: { scanned_at: string | null }[]): number[] {
  const buckets = new Array<number>(14).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();
  scans.forEach((s) => {
    if (!s.scanned_at) return;
    const d = new Date(s.scanned_at);
    d.setHours(0, 0, 0, 0);
    const idx = 13 - Math.floor((todayMs - d.getTime()) / 86400000);
    if (idx >= 0 && idx < 14) buckets[idx]++;
  });
  return buckets;
}

/**
 * Compare today's bucket against the average of the prior 7 days.
 *
 * Honest, computed delta — no hardcoded strings. Returns one of:
 *   - "+18% vs 7d avg"        — meaningfully above trend
 *   - "−24% vs 7d avg"        — meaningfully below
 *   - "~12 per day avg"       — within ±5% of avg (genuinely flat)
 *   - "No recent activity"    — both today and the prior week are zero
 *   - "First activity in 7d"  — today > 0 but prior week was zero
 */
export function deltaVsPrior7dAvg(trend14: number[]): DeltaResult {
  return trendDelta(
    trend14,
    (avg) => `~${Math.round(avg).toLocaleString()} per day avg`
  );
}

// ─── Snapshot helpers (P1) ──────────────────────────────────────────────────

/**
 * Pull a numeric series out of the last 14 daily snapshots, oldest first,
 * with missing days filled as 0. Used for KPI sparklines.
 *
 * snapshots arrives newest-first from supabase (we `.order("snapshot_date",
 * desc).limit(14)`); this function reverses + maps + pads.
 */
export function snapshotsAsSpark(
  snapshots: InventorySnapshotRow[],
  key:
    | "total_units"
    | "total_value"
    | "sku_count"
    | "active_sku_count"
    | "low_stock_count"
    | "location_count"
): number[] {
  const byDate = new Map<string, InventorySnapshotRow>();
  for (const s of snapshots) {
    byDate.set(s.snapshot_date, s);
  }

  const values = new Array<number>(14).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < 14; i++) {
    // values[0] = 14 days ago, values[13] = today
    const d = new Date(today);
    d.setDate(today.getDate() - (13 - i));
    const iso = d.toISOString().slice(0, 10);
    const row = byDate.get(iso);
    if (!row) continue;
    const raw = row[key];
    const n = typeof raw === "string" ? parseFloat(raw) : Number(raw ?? 0);
    values[i] = Number.isFinite(n) ? n : 0;
  }

  return values;
}

/**
 * Same delta logic as scans, but with stock-style wording ("~$12.3k 7d avg"
 * rather than "~$12.3k per day avg"). Stock metrics aren't a rate — they're
 * a level — so the "per day" phrasing is wrong for them.
 *
 * Returns "Not enough history yet" when fewer than two valid snapshots exist
 * in the prior 7 days. This prevents a single seeded snapshot from being
 * presented as a real comparison.
 */
export function snapshotDelta(
  values: number[],
  format: (n: number) => string = (n) => Math.round(n).toLocaleString()
): DeltaResult {
  const today = values[values.length - 1] ?? 0;
  const prior7 = values.slice(-8, -1); // up to 7 days ending yesterday
  const nonZeroPrior = prior7.filter((v) => v > 0);

  if (nonZeroPrior.length < 2) {
    return {
      value: "Not enough history yet",
      direction: "flat",
      tone: "neutral",
    };
  }

  const avg = nonZeroPrior.reduce((a, b) => a + b, 0) / nonZeroPrior.length;

  const diff = today - avg;
  const pct = avg > 0 ? Math.round((diff / avg) * 100) : 0;

  if (Math.abs(pct) < 5) {
    return {
      value: `~${format(avg)} 7d avg`,
      direction: "flat",
      tone: "neutral",
    };
  }

  const sign = diff > 0 ? "+" : "−";
  return {
    value: `${sign}${Math.abs(pct)}% vs 7d avg`,
    direction: diff > 0 ? "up" : "down",
    // For value/stock metrics, going UP is generally good (more inventory
    // value, more SKUs in motion). For low_stock_count this is inverted —
    // callers can post-process if they need to flip the tone.
    tone: diff > 0 ? "good" : "neutral",
  };
}

// ─── Internal ───────────────────────────────────────────────────────────────

function trendDelta(
  values: number[],
  flatLabel: (avg: number) => string
): DeltaResult {
  const today = values[values.length - 1] ?? 0;
  const prior7 = values.slice(-8, -1); // up to 7 days ending yesterday
  const sum = prior7.reduce((a, b) => a + b, 0);
  const avg = sum / Math.max(1, prior7.length);

  if (avg === 0 && today === 0) {
    return { value: "No recent activity", direction: "flat", tone: "neutral" };
  }
  if (avg === 0) {
    return {
      value: "First activity in 7d",
      direction: "up",
      tone: "good",
    };
  }

  const diff = today - avg;
  const pct = Math.round((diff / avg) * 100);

  if (Math.abs(pct) < 5) {
    return {
      value: flatLabel(avg),
      direction: "flat",
      tone: "neutral",
    };
  }

  const sign = diff > 0 ? "+" : "−";
  return {
    value: `${sign}${Math.abs(pct)}% vs 7d avg`,
    direction: diff > 0 ? "up" : "down",
    tone: diff > 0 ? "good" : "neutral",
  };
}

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Compact currency formatter for KPI displays.
 *   <  $10,000  → "$1,234"
 *   <  $1M      → "$12.5k"
 *   >= $1M      → "$1.24m"
 *
 * Returns "—" for null/NaN so callers don't have to guard.
 */
export function formatCurrency(value: number | string | null): string {
  const n =
    typeof value === "string" ? parseFloat(value) : Number(value ?? NaN);
  if (!Number.isFinite(n)) return "—";

  if (n >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(2)}m`;
  }
  if (n >= 10_000) {
    return `$${(n / 1_000).toFixed(1)}k`;
  }
  return `$${Math.round(n).toLocaleString()}`;
}
