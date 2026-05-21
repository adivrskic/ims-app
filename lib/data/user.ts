import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

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
 * The canonical "current org context" used by actions and pages. Returns
 * the user's primary org (first one — TODO: respect current workspace
 * cookie when multi-org workspace switching is fully wired).
 */
export const getCurrentOrgContext = cache(async () => {
  const memberships = await getMemberships();
  if (memberships.length === 0) return null;
  const first = memberships[0];
  return {
    user: (await getCurrentUser())!,
    orgId: first.org_id,
    role: first.role,
  };
});
