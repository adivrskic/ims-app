"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import {
  findResendIntegration,
  sendInviteViaResend,
} from "@/lib/integrations/resend";
import { createAdminClient } from "@/lib/supabase/admin";

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "No workspace membership" as const };
  return {
    supabase,
    user,
    orgId: membership.org_id as string,
    role: membership.role as string,
  };
}

// ─── MEMBERS ───────────────────────────────────────────────────

export async function inviteMember(_prev: unknown, formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "member");

  if (!email || !email.includes("@")) {
    return { error: "Enter a valid email" };
  }
  if (!["admin", "member"].includes(role)) {
    return { error: "Invalid role" };
  }
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can invite" };
  }

  const token = randomBytes(16).toString("hex");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  const { error } = await ctx.supabase.from("org_invites").insert({
    org_id: ctx.orgId,
    email,
    role,
    token,
    invited_by: ctx.user.id,
    expires_at: expiresAt,
  });

  if (error) {
    return {
      error: error.message.includes("duplicate")
        ? "An invite for this email already exists"
        : error.message,
    };
  }

  // If Resend is connected, fire-and-forget the invite email. The invite
  // row is already saved, so even if email delivery fails the link can
  // still be shared manually.
  const resendIntegration = await findResendIntegration(ctx.orgId);
  let emailDelivered = false;
  if (resendIntegration) {
    const admin = createAdminClient();
    const [{ data: orgRow }, { data: inviterProfile }] = await Promise.all([
      admin.from("orgs").select("name").eq("id", ctx.orgId).maybeSingle(),
      admin
        .from("profiles")
        .select("full_name, email")
        .eq("id", ctx.user.id)
        .maybeSingle(),
    ]);
    const result = await sendInviteViaResend(resendIntegration, {
      inviterName:
        inviterProfile?.full_name ?? inviterProfile?.email ?? "A teammate",
      inviterEmail: inviterProfile?.email ?? ctx.user.email ?? "",
      orgName: orgRow?.name ?? "the workspace",
      role,
      token,
      recipientEmail: email,
      expiresAt: new Date(expiresAt),
    });
    emailDelivered = result.ok;
    if (!result.ok) {
      console.error("[invite] Resend send failed:", result.error);
    }
  }

  revalidatePath("/settings/members");
  return {
    success: emailDelivered
      ? `Invite emailed to ${email}`
      : `Invite created for ${email} — share the link manually or connect Resend to auto-send`,
  };
}

export async function revokeInvite(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("org_invites")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/settings/members");
}

export async function removeMember(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
  const userId = String(formData.get("user_id") ?? "");
  if (userId === ctx.user.id) return; // can't remove self
  await ctx.supabase
    .from("org_members")
    .delete()
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId);
  revalidatePath("/settings/members");
}

// ─── API KEYS ──────────────────────────────────────────────────

export async function createApiKey(_prev: unknown, formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can create keys" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const scopes = formData.getAll("scopes").map(String);

  if (!name) return { error: "Name is required" };
  if (scopes.length === 0) return { error: "Select at least one scope" };

  const raw = randomBytes(24).toString("base64url");
  const prefix = `nb_live_${raw.slice(0, 4)}`;
  const full = `${prefix}_${raw}`;
  const hash = createHash("sha256").update(full).digest("hex");

  const { error } = await ctx.supabase.from("api_keys").insert({
    org_id: ctx.orgId,
    name,
    key_prefix: prefix,
    key_hash: hash,
    scopes,
    created_by: ctx.user.id,
  });

  if (error) return { error: error.message };

  revalidatePath("/settings/api-keys");
  return { success: "Key created", token: full };
}

export async function revokeApiKey(formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/settings/api-keys");
}
