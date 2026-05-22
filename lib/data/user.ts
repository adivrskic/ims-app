import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/currentWorkspace";

/**
 * Request-cached fetchers for user / profile / membership.
 *
 * These wrap Supabase queries in React's `cache()` so multiple callers
 * within the same request share one result. The cache lives for the
 * duration of the request and resets between requests — perfect for
 * deduping the auth check and membership lookup the layout, pages, and
 * actions all need.
 *
 * NOT for cross-request caching — use lib/data/org.ts for that.
 */

export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export const getProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, email, full_name, phone, created_at")
    .eq("id", user.id)
    .maybeSingle();
  return data;
});

export interface Membership {
  org_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string | null;
  org: { id: string; name: string; slug: string } | null;
}

export const getMemberships = cache(async (): Promise<Membership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("org_members")
    .select("org_id, role, joined_at, org:orgs ( id, name, slug )")
    .eq("user_id", user.id);
  return (data ?? []).map((m) => {
    const org = Array.isArray(m.org) ? m.org[0] : m.org;
    return {
      org_id: m.org_id as string,
      role: m.role as "owner" | "admin" | "member",
      joined_at: m.joined_at as string | null,
      org: org as { id: string; name: string; slug: string } | null,
    };
  });
});

/**
 * Resolve the user's currently active membership, respecting the
 * workspace cookie when present.
 *
 * - If the cookie names a workspace the user belongs to → that one.
 * - Otherwise (no cookie, or stale cookie pointing to a left org) →
 *   the first membership.
 * - No memberships → null.
 *
 * This is the single source of truth for "which workspace is the user
 * looking at right now." Every server-side data fetch goes through here
 * via `getCurrentOrgContext`.
 */
export const getActiveMembership = cache(
  async (): Promise<Membership | null> => {
    const memberships = await getMemberships();
    if (memberships.length === 0) return null;

    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(CURRENT_WORKSPACE_COOKIE)?.value;

    if (cookieValue) {
      const match = memberships.find((m) => m.org_id === cookieValue);
      if (match) return match;
      // Stale cookie — silent fall-through to first membership. We
      // can't mutate cookies from a cached read; the next successful
      // switchWorkspace call will overwrite it.
    }

    return memberships[0];
  }
);

/**
 * The canonical "current org context" used by server actions and pages.
 * Returns the user + the org they're currently looking at + their role.
 *
 * Now honors the workspace cookie (was previously hardcoded to
 * memberships[0], a silent bug for multi-org users).
 */
export const getCurrentOrgContext = cache(async () => {
  const active = await getActiveMembership();
  if (!active) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return {
    user,
    orgId: active.org_id,
    role: active.role,
  };
});
