"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/email/invite";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/currentWorkspace";
import { CURRENT_FACILITY_COOKIE } from "@/lib/currentFacility";
import { isIndustrySlug } from "@/lib/industries";

export interface OnboardingState {
  error?: string;
  invites?: { email: string; url: string }[];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) ||
    // Fallback for names that strip to empty
    `ws-${randomBytes(3).toString("hex")}`
  );
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

/**
 * Switch the active workspace.
 *
 * Validates the user actually belongs to the target org BEFORE writing the
 * cookie — never let a client pin the cookie to a workspace they're not a
 * member of. (getActiveMembership also re-validates on every read, so a forged
 * cookie wouldn't grant access regardless, but validating here gives a clean
 * error and avoids setting a dead cookie.)
 *
 * Called by the sidebar WorkspaceSwitcher. Returns { error } on failure; the
 * switcher surfaces it and refreshes.
 */
export async function switchWorkspace(
  formData: FormData
): Promise<{ error?: string }> {
  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) return { error: "No workspace specified" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Your session expired. Sign in again." };

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!membership) {
    return { error: "You're not a member of that workspace" };
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_WORKSPACE_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  // Bust the whole layout subtree so every cached fetch re-resolves against
  // the new active org.
  revalidatePath("/", "layout");
  return {};
}

/**
 * Bootstrap a new workspace for a self-signed-up user.
 *
 * Preconditions enforced server-side:
 *   - User is authenticated (Supabase auth.getUser)
 *   - User has zero existing memberships — prevents abuse where someone
 *     reuses this flow to create unlimited orgs
 *
 * Steps (admin client, in order):
 *   1. Create the organization
 *   2. Upsert the user's profile row (signup may not have created one)
 *   3. Insert org_members with role=owner
 *   4. Create the first facility (warehouse)
 *   5. Optionally create org_invites for any provided teammate emails + email
 *
 * Non-atomic — if step 3 fails after step 1, the org is orphaned. For
 * v1 this is acceptable (rare; cleanup is a manual SQL). Future: wrap
 * in a Postgres SECURITY DEFINER function so it's transactional.
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
  const industryRaw = String(formData.get("industry") ?? "").trim();
  const industry = isIndustrySlug(industryRaw) ? industryRaw : null;
  const facilityName = String(formData.get("facility_name") ?? "").trim();
  const facilityCity = String(formData.get("facility_city") ?? "").trim();
  const facilityState = String(formData.get("facility_state") ?? "").trim();
  const facilityZip = String(formData.get("facility_zip") ?? "").trim();
  const inviteRaw = String(formData.get("invite_emails") ?? "");

  if (!workspaceName) return { error: "Workspace name is required" };
  if (workspaceName.length < 2) {
    return { error: "Workspace name must be at least 2 characters" };
  }
  if (!facilityName) return { error: "Facility name is required" };

  const inviteEmails = parseEmails(inviteRaw).filter((e) => e !== user.email);
  // Deduplicate
  const uniqueInvites = Array.from(new Set(inviteEmails));

  // ── 4. Provision (atomic) ────────────────────────────────────────
  // org + profile + owner membership + first facility in a single transaction
  // via app.provision_workspace, so a mid-sequence failure can't orphan an org.
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
    }
  );
  if (provErr || !provisioned) {
    return {
      error: `Couldn't create the workspace (${
        provErr?.message ?? "unknown error"
      }). Try again.`,
    };
  }
  const org = { id: (provisioned as { orgId: string }).orgId };

  // 4f. Optional invites — insert rows, email them, collect share links.
  let inviteLinks: { email: string; url: string }[] = [];
  if (uniqueInvites.length > 0) {
    const expiresAtMs = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const expiresAt = new Date(expiresAtMs).toISOString();
    const inviteRows = uniqueInvites.map((email) => ({
      org_id: org.id,
      email,
      role: "member",
      token: randomBytes(16).toString("hex"),
      invited_by: user.id,
      expires_at: expiresAt,
    }));
    const { error: inviteErr } = await admin
      .from("org_invites")
      .insert(inviteRows);
    if (inviteErr) {
      console.error("[onboarding] invite inserts failed:", inviteErr);
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const inviterName =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "A teammate";
      await Promise.all(
        inviteRows.map((row) =>
          sendInviteEmail(org.id, {
            inviterName,
            inviterEmail: user.email ?? "",
            orgName: workspaceName,
            role: row.role,
            token: row.token,
            recipientEmail: row.email,
            expiresAt: new Date(expiresAtMs),
          }).catch((e) => console.error("[onboarding] invite email failed:", e))
        )
      );
      inviteLinks = inviteRows.map((row) => ({
        email: row.email,
        url: `${appUrl}/invite/${row.token}`,
      }));
    }
  }

  // ── 5. Refresh, then show invite links or redirect ────────────────
  revalidatePath("/", "layout");
  if (inviteLinks.length > 0) {
    return { invites: inviteLinks };
  }
  redirect("/");
}

/**
 * Mark a single notification as read. The notifications RLS policy already
 * scopes updates to the current user (user_id = auth.uid()); we also filter
 * user_id explicitly as defense-in-depth.
 */
export async function markNotificationRead(id: string): Promise<void> {
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("read_at", null);

  // Refresh the layout so the unread badge in the nav updates.
  revalidatePath("/", "layout");
}

/**
 * Mark all of the current user's unread notifications as read. Invoked as a
 * form action, so it receives (and ignores) FormData.
 */
export async function markAllNotificationsRead(
  _formData?: FormData
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", user.id)
    .is("read_at", null);

  revalidatePath("/", "layout");
}

/**
 * Toggle the caller's daily email digest of unread notifications. Self-serve —
 * writes only the caller's own profile row; the daily cron
 * (/api/cron/email-digests) reads the flag.
 */
export async function setDigestEmailEnabled(
  formData: FormData
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  const enabled = String(formData.get("enabled") ?? "") === "true";
  await supabase
    .from("profiles")
    .update({ digest_email_enabled: enabled })
    .eq("id", user.id);

  revalidatePath("/notifications");
}

/**
 * Set the active-facility cookie from the submitted "id" field ("all" or a
 * facility UUID). Validates a concrete id resolves to a facility the caller
 * can see (RLS-scoped) before writing the cookie — never pin to a facility the
 * user can't access. Invoked as a form action from the sidebar FacilitiesNavItem.
 */
export async function setCurrentFacility(formData: FormData): Promise<void> {
  const raw = String(formData.get("id") ?? "").trim();
  if (!raw) return;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  let value: string;
  if (raw === "all") {
    value = "all";
  } else {
    // Verify the facility exists + is visible to this user (RLS scopes to org).
    const { data: warehouse } = await supabase
      .from("warehouses")
      .select("id")
      .eq("id", raw)
      .maybeSingle();
    if (!warehouse) return; // unknown / inaccessible facility — ignore
    value = warehouse.id;
  }

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_FACILITY_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  // Bust the layout subtree so every cached fetch re-resolves against the
  // newly selected facility.
  revalidatePath("/", "layout");
}
