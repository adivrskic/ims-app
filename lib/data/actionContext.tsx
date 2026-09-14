import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/data/user";
import { isTrialExpired, TRIAL_ENDED_ERROR } from "@/lib/data/entitlement";
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
 * TRIAL GATE: once the workspace's free trial has run out unpaid
 * (lib/entitlement.ts), this returns { error: TRIAL_ENDED_ERROR } instead of a
 * context. The pages are gated already; this is what stops a tab left open
 * across the deadline, or a hand-built POST, from writing anyway. Only actions
 * an expired workspace needs in order to pay opt out with
 * `{ allowExpiredTrial: true }` — today, the billing actions.
 *
 * Returns the RLS-scoped client plus user/org/role, or { error } the action can
 * early-return. Shape matches the old local resolvers ({ supabase, user, orgId
 * }) so migrating is a near drop-in — plus `role` for owner/admin gating.
 */
export async function getActionContext(options?: {
  /** Skip the trial gate. Only for the actions a lapsed workspace needs to pay. */
  allowExpiredTrial?: boolean;
}): Promise<
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
  | { error: "Not signed in" | "No workspace" | typeof TRIAL_ENDED_ERROR }
> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "No workspace" };
  if (!options?.allowExpiredTrial && (await isTrialExpired(ctx.orgId))) {
    return { error: TRIAL_ENDED_ERROR };
  }
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
