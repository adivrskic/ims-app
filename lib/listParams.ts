/**
 * Shared URL-param parsing for URL-driven paginated list pages
 * (orders, purchase orders, customers, suppliers, lots — mirrors the
 * inventory page's pattern in lib/data/inventory.ts).
 *
 * Pure — safe to import from server components and data fetchers alike.
 */

export const PAGE_SIZE_OPTIONS = [50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

/** `?page=` → positive integer (defaults to 1). */
export function parsePage(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
}

/** `?pageSize=` → one of PAGE_SIZE_OPTIONS (defaults to DEFAULT_PAGE_SIZE). */
export function parsePageSize(raw: string | undefined): number {
  const n = Number(raw);
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n)
    ? n
    : DEFAULT_PAGE_SIZE;
}

/** Numeric page-size clamp for data fetchers (already-parsed values). */
export function clampPageSize(raw: number | undefined): number {
  if (!raw) return DEFAULT_PAGE_SIZE;
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(raw)
    ? raw
    : DEFAULT_PAGE_SIZE;
}

/**
 * Build a `%term%` pattern safe for PostgREST `.or("col.ilike.…")` filters:
 * escapes LIKE wildcards (`%`, `_`, `\`) and strips the characters PostgREST
 * treats as logic-tree delimiters inside `or=` (`,`, `(`, `)`, `"`), which
 * would otherwise break the filter or let a search term inject clauses.
 */
export function ilikePattern(term: string): string {
  const escaped = term
    .replace(/\\/g, "\\\\")
    .replace(/[%_]/g, "\\$&")
    .replace(/[,()"]/g, " ")
    .trim();
  return `%${escaped}%`;
}
