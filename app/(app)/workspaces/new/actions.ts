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

export interface AdditionalWorkspaceState {
  error?: string;
  invites?: { email: string; url: string }[];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 60) || `ws-${randomBytes(3).toString("hex")}`
  );
}

function parseEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

/**
 * Create a second (or third, etc.) workspace for an already-onboarded
 * user. Mirrors `setUpWorkspace` (in `app/onboarding/actions.ts`) minus
 * the idempotence check, and with an additional final step that auto-
 * switches the workspace cookie so the user lands in the new org
 * immediately after creation.
 *
 * Non-atomic — if facility insert fails after org/membership creation,
 * the workspace is committed and the user can recover by adding a
 * facility manually.
 *
 * Steps (admin client, in order):
 *   1. Auth check
 *   2. Validate inputs
 *   3. Insert organization (unique slug)
 *   4. Insert owner membership
 *   5. Insert first facility (warehouse)
 *   6. Optional: insert org_invites for any teammates + email them
 *   7. Set the workspace cookie to the new org, clear facility cookie
 *   8. Revalidate, then either show invite links or redirect to overview
 */
export async function createAdditionalWorkspace(
  _prev: AdditionalWorkspaceState | undefined,
  formData: FormData
): Promise<AdditionalWorkspaceState> {
  // ── 1. Auth ──────────────────────────────────────────────────────
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Sign in again to continue." };
  }

  // ── 2. Validate inputs ───────────────────────────────────────────
  const workspaceName = String(formData.get("workspace_name") ?? "").trim();
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
  const uniqueInvites = Array.from(new Set(inviteEmails));

  // ── 3. Provision (atomic) ────────────────────────────────────────
  // org + owner membership + first facility in one transaction via
  // app.provision_workspace (profile upsert is a no-op for an existing user).
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

  // 3e. Optional invites — insert rows, email them, collect share links.
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
      console.error("[create-workspace] invite inserts failed:", inviteErr);
    } else {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
      const inviterName =
        (user.user_metadata?.full_name as string | undefined) ??
        user.email ??
        "A teammate";
      // Fire-and-forget the emails (platform Resend, or the org's own if
      // connected). Rows are saved, and we surface copy-links regardless.
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
          }).catch((e) =>
            console.error("[create-workspace] invite email failed:", e)
          )
        )
      );
      inviteLinks = inviteRows.map((row) => ({
        email: row.email,
        url: `${appUrl}/invite/${row.token}`,
      }));
    }
  }

  // ── 4. Auto-switch, then show invite links or redirect ────────────
  // Set the new workspace cookie so every server component reads the new
  // org. Clear facility cookie since the previous selection doesn't apply.
  const cookieStore = await cookies();
  const cookieOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };
  cookieStore.set(CURRENT_WORKSPACE_COOKIE, org.id, cookieOpts);
  cookieStore.delete(CURRENT_FACILITY_COOKIE);

  revalidatePath("/", "layout");

  // If we created invites, return them so the form can show copy-links.
  // Otherwise go straight to the overview.
  if (inviteLinks.length > 0) {
    return { invites: inviteLinks };
  }
  redirect("/");
}
