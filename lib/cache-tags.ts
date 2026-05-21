/**
 * Cache tag generators.
 *
 * Pass these to both `unstable_cache(fn, key, { tags: [tag(...)] })` and to
 * `revalidateTag(tag(...))` so writes invalidate the same entries reads created.
 * Tag strings are namespaced by org_id so multi-org users don't share caches.
 */
export const tags = {
  categories: (orgId: string) => `org:${orgId}:categories`,
  suppliers: (orgId: string) => `org:${orgId}:suppliers`,
  warehouses: (orgId: string) => `org:${orgId}:warehouses`,
  members: (orgId: string) => `org:${orgId}:members`,
  org: (orgId: string) => `org:${orgId}`,
} as const;
