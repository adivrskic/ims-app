"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  findResendIntegration,
  sendInviteViaResend,
} from "@/lib/integrations/resend";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/currentWorkspace";
import { CURRENT_FACILITY_COOKIE } from "@/lib/currentFacility";

export interface AdditionalWorkspaceState {
  error?: string;
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
 *   6. Optional: insert org_invites for any teammates
 *   7. Set the workspace cookie to the new org, clear facility cookie
 *   8. Revalidate + redirect to overview
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

  // ── 3. Provision ─────────────────────────────────────────────────
  const admin = createAdminClient();

  // 3a. Slug — ensure uniqueness by appending a random suffix on collision.
  let slug = slugify(workspaceName);
  const { data: slugTaken } = await admin
    .from("orgs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugTaken) {
    slug = `${slug}-${randomBytes(2).toString("hex")}`;
  }

  // 3b. Create org
  const { data: org, error: orgErr } = await admin
    .from("orgs")
    .insert({ name: workspaceName, slug })
    .select("id, name")
    .single();
  if (orgErr || !org) {
    return {
      error: `Couldn't create the workspace (${
        orgErr?.message ?? "unknown error"
      }). Try again.`,
    };
  }

  // 3c. Owner membership
  const { error: memberErr } = await admin.from("org_members").insert({
    org_id: org.id,
    user_id: user.id,
    role: "owner",
  });
  if (memberErr) {
    await admin.from("orgs").delete().eq("id", org.id);
    return {
      error: `Couldn't link you to the workspace (${memberErr.message}). Try again.`,
    };
  }

  // 3d. First facility
  const { error: facilityErr } = await admin.from("warehouses").insert({
    org_id: org.id,
    name: facilityName,
    city: facilityCity || null,
    state: facilityState || null,
    zip: facilityZip || null,
    owner_id: user.id,
    is_active: true,
  });
  if (facilityErr) {
    // Membership + org are now committed — leave them, surface the error.
    return {
      error: `Workspace created, but the first facility failed (${facilityErr.message}). Add one manually from Facilities.`,
    };
  }

  // 3e. Optional invites
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
      const resendIntegration = await findResendIntegration(org.id);
      if (resendIntegration) {
        const inviterName =
          (user.user_metadata?.full_name as string | undefined) ??
          user.email ??
          "A new teammate";
        await Promise.all(
          inviteRows.map((row) =>
            sendInviteViaResend(resendIntegration, {
              inviterName,
              inviterEmail: user.email ?? "",
              orgName: workspaceName,
              role: row.role,
              token: row.token,
              recipientEmail: row.email,
              expiresAt: new Date(expiresAtMs),
            }).catch((e) => {
              console.error("[create-workspace] invite email failed:", e);
            })
          )
        );
      }
    }
  }

  // ── 4. Auto-switch + redirect ────────────────────────────────────
  // Set the new workspace cookie so when we redirect the user, every
  // server component reads the new org. Clear facility cookie since the
  // selection from the previous workspace doesn't apply.
  const cookieStore = await cookies();
  const cookieOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };
  cookieStore.set(CURRENT_WORKSPACE_COOKIE, org.id, cookieOpts);
  cookieStore.delete(CURRENT_FACILITY_COOKIE);

  revalidatePath("/", "layout");
  redirect("/");
}
