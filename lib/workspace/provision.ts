import "server-only";
import { randomBytes } from "crypto";
import type { User } from "@supabase/supabase-js";
import { appUrl as resolveAppUrl } from "@/lib/appUrl";
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
import type { WorkspaceCreateState, WorkspaceInvite } from "./types";

export type ProvisionResult =
  | { kind: "created"; orgId: string; state: WorkspaceCreateState }
  | { kind: "already_member" }
  | { kind: "error"; error: string };

/**
 * Validate the wizard's answers and provision a workspace for `user`.
 *
 * One implementation for both entry points — first-time onboarding
 * (`requireNoMembership: true`, enforced again inside the RPC under an
 * advisory lock so a two-tab double submit cannot mint two orgs) and the
 * in-app "new workspace" flow. Provisioning is ATOMIC: org + profile +
 * owner membership + first facility (with its Receiving door) commit in
 * one transaction via app.provision_workspace. The wizard's choices persist
 * to orgs.enabled_modules / priorities / onboarding and warehouses.size_class.
 *
 * Invites are inserted after the workspace commits; a failure is surfaced
 * honestly (workspace still created, links recoverable from Settings →
 * Members). Email sends are awaited and reported per recipient.
 */
export async function provisionWorkspaceFromWizard(
  formData: FormData,
  opts: { user: User; requireNoMembership: boolean; logTag: string }
): Promise<ProvisionResult> {
  const { user } = opts;

  // ── Inputs ───────────────────────────────────────────────────────
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

  if (!workspaceName) return { kind: "error", error: "Workspace name is required" };
  if (workspaceName.length < 2) {
    return {
      kind: "error",
      error: "Workspace name must be at least 2 characters",
    };
  }
  // Bounded well under orgs.name's varchar(255): without this, an over-long
  // name surfaces as a raw Postgres 22001 that repeats on every retry with
  // no hint that the name is the problem.
  if (workspaceName.length > MAX_NAME_LENGTH) {
    return {
      kind: "error",
      error: `Workspace name is too long — keep it under ${MAX_NAME_LENGTH} characters.`,
    };
  }
  if (!facilityName) return { kind: "error", error: "Facility name is required" };
  if (facilityName.length > MAX_NAME_LENGTH) {
    return {
      kind: "error",
      error: `Facility name is too long — keep it under ${MAX_NAME_LENGTH} characters.`,
    };
  }

  const uniqueInvites = parseEmails(inviteRaw, user.email);
  const enabledModules = modulesFromActivities(activities);
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ?? null;

  // ── Provision (atomic) ───────────────────────────────────────────
  const admin = createAdminClient();
  const { data: provisioned, error: provErr } = await admin.rpc(
    "provision_workspace",
    {
      p_user_id: user.id,
      p_user_email: user.email,
      p_full_name: fullName,
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
      p_require_no_membership: opts.requireNoMembership,
    }
  );
  if (provErr || !provisioned) {
    if (provErr?.message?.includes("already_member")) {
      return { kind: "already_member" };
    }
    return {
      kind: "error",
      error: `Couldn't create the workspace (${
        provErr?.message ?? "unknown error"
      }). Try again.`,
    };
  }
  const orgId = (provisioned as { orgId: string }).orgId;

  // ── Optional invites ─────────────────────────────────────────────
  let invites: WorkspaceInvite[] = [];
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
      console.error(`[${opts.logTag}] invite inserts failed:`, inviteErr);
      inviteError =
        "Your workspace is ready, but the invites couldn't be created. Add your team from Settings → Members.";
    } else {
      const appUrl = resolveAppUrl();
      const inviterName = fullName ?? user.email ?? "A teammate";
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
            console.error(`[${opts.logTag}] invite email failed:`, e);
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

  return {
    kind: "created",
    orgId,
    state: { success: true, orgName: workspaceName, invites, inviteError },
  };
}
