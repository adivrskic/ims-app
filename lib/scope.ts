/**
 * Shared scope helpers for dashboard pages.
 *
 * "Scope" = warehouse filter + date range filter. Lives in URL search params
 * (?warehouse=xxx&range=30d) so it's bookmarkable and survives refresh.
 *
 * Used by Overview, Analytics, and Dead Stock — anywhere a filter bar is
 * present at the top of the page.
 */

export const RANGES = ["7d", "14d", "30d", "90d"] as const;
export type Range = (typeof RANGES)[number];

export interface Scope {
  /** null = all facilities (org-wide) */
  warehouseId: string | null;
  range: Range;
}

const RANGE_DAYS: Record<Range, number> = {
  "7d": 7,
  "14d": 14,
  "30d": 30,
  "90d": 90,
};

const RANGE_LABEL: Record<Range, string> = {
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

const DEFAULT_RANGE: Range = "14d";

/**
 * Parse the scope from a Next.js searchParams object. Unknown values get
 * dropped silently and replaced with defaults — we'd rather render something
 * than show an error for a typo'd URL.
 */
export function parseScope(params: {
  warehouse?: string;
  range?: string;
}): Scope {
  const warehouseId =
    params.warehouse && params.warehouse.trim().length > 0
      ? params.warehouse
      : null;
  const range = (RANGES as readonly string[]).includes(params.range ?? "")
    ? (params.range as Range)
    : DEFAULT_RANGE;
  return { warehouseId, range };
}

/** Render a Scope back into URL-search-param shape. */
export function scopeToSearchParams(scope: Scope): URLSearchParams {
  const sp = new URLSearchParams();
  if (scope.warehouseId) sp.set("warehouse", scope.warehouseId);
  if (scope.range !== DEFAULT_RANGE) sp.set("range", scope.range);
  return sp;
}

/** Convert range to number of days. */
export function rangeDays(range: Range): number {
  return RANGE_DAYS[range];
}

export function rangeLabel(range: Range): string {
  return RANGE_LABEL[range];
}

/**
 * Compute the start Date for the scope's range (midnight, local time).
 * Use as the lower bound on time-windowed queries.
 */
export function rangeStart(range: Range): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - rangeDays(range));
  return d;
}
