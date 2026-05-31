import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import type { Permission } from "@/lib/permissions";

/**
 * The single context helper every server action should use to resolve "which
 * workspace am I acting on" — built on the cookie-aware getCurrentOrgContext.
 *
 * WHY THIS EXISTS: several action files used to define their own
 * getOrgContext() that queried `org_members ... .limit(1)`. That ignores the
 * workspace cookie, so after a user switched workspaces their *reads* (which go
 * through getCurrentOrgContext) followed the switch but their *writes* still
 * targeted membership[0] — a silent cross-org bug. Route all actions through
 * here so reads and writes always agree on the active org.
 *
 * Returns the RLS-scoped client plus user/org/role, or { error } the action can
 * early-return. Shape matches the old local resolvers ({ supabase, user, orgId
 * }) so migrating is a near drop-in — plus `role` for owner/admin gating.
 */
export async function getActionContext(): Promise<
  | {
      supabase: Awaited<ReturnType<typeof createClient>>;
      user: NonNullable<
        Awaited<ReturnType<typeof getCurrentOrgContext>>
      >["user"];
      orgId: string;
      role: "owner" | "admin" | "member";
      permissions: Set<Permission>;
      can: (p: Permission) => boolean;
    }
  | { error: "Not signed in" | "No workspace" }
> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "No workspace" };
  const supabase = await createClient();
  return {
    supabase,
    user: ctx.user,
    orgId: ctx.orgId,
    role: ctx.role,
    permissions: ctx.permissions,
    can: ctx.can,
  };
}
