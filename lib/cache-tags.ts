/**
 * Cache tag generators.
 *
 * Pass these to both `unstable_cache(fn, key, { tags: [tag(...)] })` and to
 * `revalidateTag(tag(...))` so writes invalidate the same entries reads created.
 * Tag strings are namespaced by org_id so multi-org users don't share caches.
 *
 * Two tiers:
 *   - Reference data (categories/suppliers/warehouses/members/org) — already
 *     cross-request cached in lib/data/org.ts.
 *   - Operational data (inventory/orders/purchase_orders/returns/scans/
 *     sections/notifications/cycle_counts/customers) — used by the per-page
 *     fetchers we move into unstable_cache so navigations serve from cache
 *     instead of re-querying. Mutating actions for each domain MUST
 *     revalidateTag the matching tag; the relevant *Realtime component
 *     invalidates the same tag on a postgres_changes event.
 */
export const tags = {
  // ── Reference (slow-changing) ──────────────────────────────────────
  categories: (orgId: string) => `org:${orgId}:categories`,
  suppliers: (orgId: string) => `org:${orgId}:suppliers`,
  warehouses: (orgId: string) => `org:${orgId}:warehouses`,
  members: (orgId: string) => `org:${orgId}:members`,
  org: (orgId: string) => `org:${orgId}`,

  // ── Operational (per-page data) ────────────────────────────────────
  inventory: (orgId: string) => `org:${orgId}:inventory`,
  products: (orgId: string) => `org:${orgId}:products`,
  orders: (orgId: string) => `org:${orgId}:orders`,
  purchaseOrders: (orgId: string) => `org:${orgId}:purchase_orders`,
  returns: (orgId: string) => `org:${orgId}:returns`,
  scans: (orgId: string) => `org:${orgId}:scans`,
  sections: (orgId: string) => `org:${orgId}:sections`,
  cycleCounts: (orgId: string) => `org:${orgId}:cycle_counts`,
  customers: (orgId: string) => `org:${orgId}:customers`,
  notifications: (orgId: string) => `org:${orgId}:notifications`,
} as const;

/**
 * Maps a Postgres table name (in the `app` schema) to the cache tag(s)
 * that should be invalidated when one of its rows changes. Used by the
 * realtime layer to translate a postgres_changes event into a targeted
 * revalidateTag instead of a full router.refresh().
 *
 * A table can map to more than one tag:
 *   - `products` affects both the products catalog and the inventory list.
 *   - `locations` affects the inventory list (on-hand counts).
 *   - `scan_history` is the audit log AND the inventory page's "recent
 *     activity"; the original InventoryRealtime subscribes to it, so we
 *     bust the inventory tag too to preserve that refresh behavior.
 *   - `cycle_counts` can adjust a location quantity (→ inventory) and is the
 *     subject of the cycle-counts page (→ cycleCounts).
 */
export function tagsForTable(table: string, orgId: string): string[] {
  switch (table) {
    case "products":
      return [tags.products(orgId), tags.inventory(orgId)];
    case "locations":
      return [tags.inventory(orgId)];
    case "scan_history":
      return [tags.scans(orgId), tags.inventory(orgId)];
    case "cycle_counts":
      return [tags.inventory(orgId), tags.cycleCounts(orgId)];
    case "orders":
    case "order_items":
      return [tags.orders(orgId)];
    case "purchase_orders":
    case "po_line_items":
      return [tags.purchaseOrders(orgId)];
    case "returns":
      return [tags.returns(orgId)];
    case "sections":
      return [tags.sections(orgId), tags.inventory(orgId)];
    case "customers":
      return [tags.customers(orgId)];
    case "notifications":
      return [tags.notifications(orgId)];
    case "categories":
      return [tags.categories(orgId)];
    case "suppliers":
      return [tags.suppliers(orgId)];
    case "warehouses":
      return [tags.warehouses(orgId)];
    default:
      return [];
  }
}