"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendInviteEmail } from "@/lib/email/invite";
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
  const facilityName = String(formData.get("facility_name") ?? "").trim();
  const facilityCity = String(formData.get("facility_city") ?? "").trim();
  const facilityState = String(formData.get("facility_state") ?? "").trim();
  const facilityZip = String(formData.get("facility_zip") ?? "").trim();
  const inviteRaw = String(formData.get("invite_emails") ?? "");
  const industryRaw = String(formData.get("industry") ?? "").trim();
  const industry = isIndustrySlug(industryRaw) ? industryRaw : null;

  if (!workspaceName) return { error: "Workspace name is required" };
  if (workspaceName.length < 2) {
    return { error: "Workspace name must be at least 2 characters" };
  }
  if (!facilityName) return { error: "Facility name is required" };

  const inviteEmails = parseEmails(inviteRaw).filter((e) => e !== user.email);
  // Deduplicate
  const uniqueInvites = Array.from(new Set(inviteEmails));

  // ── 4. Provision ─────────────────────────────────────────────────
  const admin = createAdminClient();

  // 4a. Slug — ensure uniqueness by appending a random suffix on collision.
  let slug = slugify(workspaceName);
  const { data: slugTaken } = await admin
    .from("orgs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugTaken) {
    slug = `${slug}-${randomBytes(2).toString("hex")}`;
  }

  // 4b. Create org
  const { data: org, error: orgErr } = await admin
    .from("orgs")
    .insert({ name: workspaceName, slug, industry })
    .select("id, name")
    .single();
  if (orgErr || !org) {
    return {
      error: `Couldn't create the workspace (${
        orgErr?.message ?? "unknown error"
      }). Try again.`,
    };
  }

  // 4c. Upsert profile — signup creates auth.users but not profiles.
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: user.id,
      email: user.email,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    },
    { onConflict: "id" }
  );
  if (profileErr) {
    await admin.from("orgs").delete().eq("id", org.id);
    return {
      error: `Couldn't create your profile (${profileErr.message}). Try again.`,
    };
  }

  // 4d. Membership as owner
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

  // 4e. First facility
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
    // Membership + org are now committed — leave them, but report.
    return {
      error: `Workspace created, but the first facility failed (${facilityErr.message}). Add one manually from Facilities.`,
    };
  }

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
