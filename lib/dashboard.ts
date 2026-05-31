/**
 * Shared formatting helpers for dashboard / analytics pages.
 */

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
