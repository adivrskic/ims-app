import { cookies } from "next/headers";
import { getMemberships } from "@/lib/data/user";

/**
 * Cookie name for the user's selected workspace.
 *
 * Value is a workspace (org) UUID. Absent → no explicit selection;
 * resolver falls back to the user's first membership.
 *
 * Set by the `switchWorkspace` server action when the user picks
 * something in the sidebar's WorkspaceSwitcher. Read everywhere data
 * is fetched via `getCurrentOrgContext` and `getActiveMembership`.
 *
 * Naming follows the existing facility-cookie convention so future
 * cookie-management code can find both with a common prefix.
 */
export const CURRENT_WORKSPACE_COOKIE = "Nautilus-current-workspace";

/**
 * Resolve the active workspace org_id for the current request.
 *
 * Order:
 *   1. Cookie value, if the user is actually a member of that org
 *   2. First membership in the user's list (stable per session;
 *      Supabase returns memberships in insertion order)
 *   3. null — user has no memberships (caller should redirect to onboarding)
 *
 * The cookie is validated against memberships every read — stale cookies
 * (e.g. the user was removed from an org but their browser still has the
 * cookie) silently fall back to membership[0] rather than throwing. We
 * cannot mutate cookies from a cached read, so the bad cookie persists
 * until the next mutation (a successful switchWorkspace call clears it).
 */
export async function getCurrentWorkspaceId(): Promise<string | null> {
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(CURRENT_WORKSPACE_COOKIE)?.value;

  if (cookieValue) {
    const match = memberships.find((m) => m.org_id === cookieValue);
    if (match) return match.org_id;
    // Stale cookie — fall through.
  }

  return memberships[0].org_id;
}
