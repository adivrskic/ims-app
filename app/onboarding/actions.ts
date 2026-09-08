"use server";

import { redirect } from "next/navigation";
import { appUrl as resolveAppUrl } from "@/lib/appUrl";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/email/invite";
import { isIndustrySlug } from "@/lib/industries";
import { slugify, parseEmails } from "@/lib/workspace/helpers";
import {
  MAX_NAME_LENGTH,
  isActivityKey,
  isSizeClass,
  modulesFromActivities,
  normalizePriorities,
} from "@/lib/modules";

export interface OnboardingInvite {
  email: string;
  url: string;
  /** Whether the invite email actually sent (links work regardless). */
  emailed: boolean;
}

export interface OnboardingState {
  error?: string;
  /** Workspace created. The wizard shows the success screen / navigates. */
  success?: boolean;
  orgName?: string;
  invites?: OnboardingInvite[];
  /** Workspace created but the invite rows failed — recoverable in Settings. */
  inviteError?: string;
}

/**
 * Bootstrap a new workspace for a self-signed-up user from the onboarding
 * wizard's answers.
 *
 * Preconditions enforced server-side:
 *   - User is authenticated (Supabase auth.getUser)
 *   - User has zero existing memberships — checked here for a clean
 *     redirect, and enforced AGAIN inside the RPC under an advisory lock
 *     (p_require_no_membership) so a two-tab double submit cannot mint two
 *     orgs.
 *
 * Provisioning is ATOMIC: org + profile + owner membership + first facility
 * (with its default Receiving door) all commit in one transaction via
 * app.provision_workspace. The wizard's choices persist to
 * orgs.enabled_modules / priorities / onboarding and warehouses.size_class,
 * which drive the sidenav, the overview dashboard, and the getting-started
 * checklist.
 *
 * Invites are inserted after the workspace commits; an insert failure is
 * surfaced honestly (workspace still created, links recoverable from
 * Settings → Members) instead of the old silent console.error. Email sends
 * are awaited and reported per-recipient so the success screen never claims
 * "we emailed everyone" when a send bounced.
 */
export async function setUpWorkspace(
  _prev: OnboardingState | undefined,
  formData: FormData
): Promise<OnboardingState> {
  // ── 1. Auth ──────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Sign in again to continue." };
  }

  // ── 2. Idempotence check ─────────────────────────────────────────
  const { data: existingMembership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existingMembership) {
    // Already onboarded — don't run again, just send them home.
    redirect("/");
  }

  // ── 3. Validate inputs ───────────────────────────────────────────
  const workspaceName = String(formData.get("workspace_name") ?? "").trim();
  const facilityName = String(formData.get("facility_name") ?? "").trim();
  const facilityCity = String(formData.get("facility_city") ?? "").trim();
  const facilityState = String(formData.get("facility_state") ?? "").trim();
  const facilityZip = String(formData.get("facility_zip") ?? "").trim();
  const inviteRaw = String(formData.get("invite_emails") ?? "");
  const industryRaw = String(formData.get("industry") ?? "").trim();
  const industry = isIndustrySlug(industryRaw) ? industryRaw : null;
  const sizeRaw = String(formData.get("size_class") ?? "").trim();
  const sizeClass = isSizeClass(sizeRaw) ? sizeRaw : null;
  const activities = formData
    .getAll("activities")
    .map(String)
    .filter(isActivityKey);
  const priorities = normalizePriorities(
    formData.getAll("priorities").map(String)
  );

  if (!workspaceName) return { error: "Workspace name is required" };
  if (workspaceName.length < 2) {
    return { error: "Workspace name must be at least 2 characters" };
  }
  // Bounded well under orgs.name's varchar(255): without this, an over-long
  // name surfaces as a raw Postgres 22001 that repeats on every retry with
  // no hint that the name is the problem.
  if (workspaceName.length > MAX_NAME_LENGTH) {
    return {
      error: `Workspace name is too long — keep it under ${MAX_NAME_LENGTH} characters.`,
    };
  }
  if (!facilityName) return { error: "Facility name is required" };
  if (facilityName.length > MAX_NAME_LENGTH) {
    return {
      error: `Facility name is too long — keep it under ${MAX_NAME_LENGTH} characters.`,
    };
  }

  const uniqueInvites = parseEmails(inviteRaw, user.email);
  const enabledModules = modulesFromActivities(activities);

  // ── 4. Provision (atomic) ────────────────────────────────────────
  const admin = createAdminClient();
  const { data: provisioned, error: provErr } = await admin.rpc(
    "provision_workspace",
    {
      p_user_id: user.id,
      p_user_email: user.email,
      p_full_name:
        (user.user_metadata?.full_name as string | undefined) ?? null,
      p_name: workspaceName,
      p_slug: slugify(workspaceName),
      p_industry: industry,
      p_facility_name: facilityName,
      p_city: facilityCity || null,
      p_state: facilityState || null,
      p_zip: facilityZip || null,
      p_enabled_modules: enabledModules,
      p_priorities: priorities.length > 0 ? priorities : null,
      p_onboarding: {
        version: 1,
        industry,
        activities,
        priorities,
        size_class: sizeClass,
      },
      p_size_class: sizeClass,
      p_require_no_membership: true,
    }
  );
  if (provErr || !provisioned) {
    // The in-RPC double-submit guard: the other tab already created it.
    if (provErr?.message?.includes("already_member")) redirect("/");
    return {
      error: `Couldn't create the workspace (${
        provErr?.message ?? "unknown error"
      }). Try again.`,
    };
  }
  const orgId = (provisioned as { orgId: string }).orgId;

  // ── 5. Optional invites ──────────────────────────────────────────
  let invites: OnboardingInvite[] = [];
  let inviteError: string | undefined;
  if (uniqueInvites.length > 0) {
    const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const inviteRows = uniqueInvites.map((email) => ({
      org_id: orgId,
      email,
      role: "member",
      token: randomBytes(16).toString("hex"),
      invited_by: user.id,
      expires_at: new Date(expiresAtMs).toISOString(),
    }));
    const { error: inviteErr } = await admin
      .from("org_invites")
      .insert(inviteRows);
    if (inviteErr) {
      console.error("[onboarding] invite inserts failed:", inviteErr);
      inviteError =
        "Your workspace is ready, but the invites couldn't be created. Add your team from Settings → Members.";
    } else {
      const appUrl = resolveAppUrl();
      const inviterName =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "A teammate";
      const sendResults = await Promise.all(
        inviteRows.map((row) =>
          sendInviteEmail(orgId, {
            inviterName,
            inviterEmail: user.email ?? "",
            orgName: workspaceName,
            role: row.role,
            token: row.token,
            recipientEmail: row.email,
            expiresAt: new Date(expiresAtMs),
          }).catch((e) => {
            console.error("[onboarding] invite email failed:", e);
            return { ok: false as const };
          })
        )
      );
      invites = inviteRows.map((row, i) => ({
        email: row.email,
        url: `${appUrl}/invite/${row.token}`,
        emailed: sendResults[i]?.ok ?? false,
      }));
    }
  }

  // ── 6. Refresh; the wizard renders the success screen / navigates ─
  revalidatePath("/", "layout");
  return { success: true, orgName: workspaceName, invites, inviteError };
}
