"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStaffUser } from "@/lib/staff";

export interface OnboardResult {
  error?: string;
  workspace_name?: string;
  owner_email?: string;
  /** Magic-link URL returned by Supabase invite. Useful when the email
   *  gets caught in a spam filter and sales needs to forward it manually. */
  magic_link_url?: string;
}

const VALID_TIERS = ["starter", "pro", "enterprise"] as const;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

/**
 * Provision a new workspace and invite its first owner.
 *
 * Run only by staff (checked via getStaffUser). Uses the service-role
 * admin client because we're creating users and inserting across the
 * organization boundary — operations RLS would block for normal users.
 *
 * On success: returns the magic-link URL Supabase generated so sales
 * has a fallback if the auto-sent invite email doesn't land.
 *
 * Failure modes are non-atomic — if invite succeeds but org insert
 * fails, the auth user is left orphaned. For a v1 this is acceptable
 * (rare; cleanup is a SQL one-liner). If it becomes painful, wrap the
 * whole thing in a Postgres function or add explicit cleanup branches.
 */
export async function createWorkspace(
  _prev: OnboardResult | undefined,
  formData: FormData
): Promise<OnboardResult> {
  // 1. Staff gate
  const staff = await getStaffUser();
  if (!staff) {
    return { error: "Not authorized — staff access required" };
  }

  // 2. Validate inputs
  const name = String(formData.get("name") ?? "").trim();
  const tier = String(formData.get("tier") ?? "starter").trim();
  const ownerEmail = String(formData.get("owner_email") ?? "")
    .trim()
    .toLowerCase();
  const ownerFullName = String(formData.get("owner_full_name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!name) return { error: "Workspace name is required" };
  if (name.length < 2) {
    return { error: "Workspace name must be at least 2 characters" };
  }
  if (!ownerEmail) return { error: "Owner email is required" };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
    return { error: "Owner email is not a valid address" };
  }
  if (!ownerFullName) return { error: "Owner full name is required" };
  if (!VALID_TIERS.includes(tier as (typeof VALID_TIERS)[number])) {
    return { error: `Invalid tier: ${tier}` };
  }

  const admin = createAdminClient();
  const slug = slugify(name);

  // 3. Check the slug is free. Two clients with the exact same name
  //    would collide; nudge the user to disambiguate before any writes.
  const { data: existingSlug } = await admin
    .from("orgs")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingSlug) {
    return {
      error: `A workspace named "${name}" already exists. Add a city or year to differentiate.`,
    };
  }

  // 4. Check the owner email isn't already in our system. If they are,
  //    they should be added as a member of the new org via a separate
  //    flow, not re-created.
  const { data: existingProfile } = await admin
    .from("profiles")
    .select("id")
    .eq("email", ownerEmail)
    .maybeSingle();
  if (existingProfile) {
    return {
      error: `${ownerEmail} already has a Nimbus account. Use "Add member" instead of creating a new workspace.`,
    };
  }

  // 5. Build the magic-link redirect target. Falls back to the request
  //    origin if NEXT_PUBLIC_APP_URL isn't set (handy for staging).
  const h = await headers();
  const origin =
    process.env.NEXT_PUBLIC_APP_URL ??
    h.get("origin") ??
    "https://app.nimbus.io";
  const redirectTo = `${origin}/auth/callback?next=/`;

  // 6. Invite the owner. This creates the auth.users row, generates a
  //    magic-link token, and sends an email. We get the user id and a
  //    direct action_link back for fallback delivery.
  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(ownerEmail, {
      data: { full_name: ownerFullName },
      redirectTo,
    });

  if (inviteError || !inviteData?.user) {
    return {
      error: `Failed to send invite: ${
        inviteError?.message ?? "unknown error"
      }`,
    };
  }

  const newUser = inviteData.user;

  // 7. Create the organization. If this fails, the auth user is orphaned
  //    — see note in the file header about cleanup.
  const { data: org, error: orgError } = await admin
    .from("orgs")
    .insert({
      name,
      slug,
      tier,
      onboarded_by: staff.id,
      onboarded_at: new Date().toISOString(),
      notes: notes || null,
    })
    .select("id, name")
    .single();

  if (orgError || !org) {
    return {
      error: `Workspace insert failed: ${
        orgError?.message ?? "unknown error"
      }. The owner account was created but is orphaned — delete it from Supabase Auth before retrying.`,
    };
  }

  // 8. Create the owner's profile row.
  const { error: profileError } = await admin.from("profiles").insert({
    id: newUser.id,
    email: ownerEmail,
    full_name: ownerFullName,
    is_staff: false,
  });

  if (profileError) {
    // Roll back the org so a retry doesn't trip the slug check
    await admin.from("orgs").delete().eq("id", org.id);
    return {
      error: `Profile insert failed: ${profileError.message}. Rolled back the workspace; you can retry.`,
    };
  }

  // 9. Link the user as owner of the org.
  const { error: memberError } = await admin.from("org_members").insert({
    org_id: org.id,
    user_id: newUser.id,
    role: "owner",
  });

  if (memberError) {
    // Partial state — profile + org exist but no membership. Clean up.
    await admin.from("profiles").delete().eq("id", newUser.id);
    await admin.from("orgs").delete().eq("id", org.id);
    return {
      error: `Membership insert failed: ${memberError.message}. Rolled back; you can retry.`,
    };
  }

  // 10. Refresh the admin dashboard so the new workspace appears.
  revalidatePath("/admin");

  // 11. Generate a copy/paste magic sign-in link as a fallback to the invite
  //     email (the owner was just created via inviteUserByEmail above, so we
  //     use type "magiclink" rather than "invite" to avoid "already registered").
  //     generateLink does NOT send an email — it only returns the link.
  //     Fail-open to undefined so a link-generation hiccup never fails onboarding.
  let magicLinkUrl: string | undefined;
  try {
    const { data: linkData } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
      options: { redirectTo },
    });
    magicLinkUrl = linkData?.properties?.action_link ?? undefined;
  } catch {
    magicLinkUrl = undefined;
  }

  return {
    workspace_name: org.name,
    owner_email: ownerEmail,
    magic_link_url: magicLinkUrl,
  };
}
