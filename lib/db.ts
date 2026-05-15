/**
 * Normalize a PostgREST joined relation that may arrive as either a single
 * object (when the relationship is many-to-one) or a single-element array
 * (when the untyped client can't resolve the FK cardinality). Returns the
 * single object or null.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
