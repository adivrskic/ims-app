"use server";

import { revalidateTag } from "next/cache";
import { getCurrentOrgContext } from "@/lib/data/user";
import { tagsForTable } from "@/lib/cache-tags";

/**
 * Targeted cache revalidation for the realtime layer.
 *
 * The `*Realtime` client components call this with the set of table names
 * they subscribe to when a postgres_changes event fires. We resolve the
 * caller's org from their session here on the server — the client never
 * supplies an org_id — so a client can only ever invalidate tags for the
 * workspace it's actually authenticated into.
 *
 * This replaces the old "router.refresh() re-runs the entire subtree"
 * behavior: only the fetchers tagged for the changed table(s) are busted,
 * so a changed order doesn't force inventory / scans / membership / facility
 * queries to re-run. The subsequent router.refresh() (still triggered by the
 * hook) re-renders the page, but every un-busted unstable_cache fetcher
 * serves from cache without touching the database.
 */
export async function revalidateForTables(tables: string[]): Promise<void> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return;

  const seen = new Set<string>();
  for (const table of tables) {
    for (const tag of tagsForTable(table, ctx.orgId)) {
      if (!seen.has(tag)) {
        seen.add(tag);
        revalidateTag(tag);
      }
    }
  }
}