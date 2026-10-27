/**
 * Small, dependency-free request validators shared by the public API routes,
 * the CSV exports and the server actions. Pure functions — safe to import
 * from client code and node tests alike.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a canonical 8-4-4-4-12 hex UUID string (any version). */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * True when `value` parses as an ISO-8601 date or date-time that
 * `Date.parse` accepts (e.g. "2026-10-26" or "2026-10-26T12:00:00Z").
 * Rejects empty strings and anything Date.parse turns into NaN.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) {
    return false;
  }
  return Number.isFinite(Date.parse(s));
}
