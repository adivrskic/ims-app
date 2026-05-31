"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { sendInviteEmail } from "@/lib/email/invite";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  effectivePermissions,
  ALL_PERMISSIONS,
  type Permission,
} from "@/lib/permissions";

async function getOrgContext() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" as const };

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role, permissions")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return { error: "No workspace membership" as const };
  const perms = effectivePermissions(
    membership.role as string,
    (membership.permissions as string[] | null) ?? null
  );
  return {
    supabase,
    user,
    orgId: membership.org_id as string,
    role: membership.role as string,
    can: (p: Permission) => perms.has(p),
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
  if (!ctx.can("members.manage")) {
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

  // Email the invite via the platform sender (or the org's own Resend if
  // connected). The row is already saved, so a failed send still leaves a
  // shareable link.
  const admin = createAdminClient();
  const [{ data: orgRow }, { data: inviterProfile }] = await Promise.all([
    admin.from("orgs").select("name").eq("id", ctx.orgId).maybeSingle(),
    admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", ctx.user.id)
      .maybeSingle(),
  ]);
  const sent = await sendInviteEmail(ctx.orgId, {
    inviterName:
      inviterProfile?.full_name ?? inviterProfile?.email ?? "A teammate",
    inviterEmail: inviterProfile?.email ?? ctx.user.email ?? "",
    orgName: orgRow?.name ?? "the workspace",
    role,
    token,
    recipientEmail: email,
    expiresAt: new Date(expiresAt),
  });
  if (!sent.ok) {
    console.error("[invite] send failed:", sent.error);
  }

  revalidatePath("/settings/members");
  return {
    success: sent.ok
      ? `Invite emailed to ${email}`
      : `Invite created for ${email} — share the link manually`,
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
  if (!ctx.can("members.manage")) return;
  const userId = String(formData.get("user_id") ?? "");
  if (userId === ctx.user.id) return; // can't remove self
  return removeMemberInner(ctx, userId);
}

async function removeMemberInner(
  ctx: { supabase: Awaited<ReturnType<typeof createClient>>; orgId: string },
  userId: string
): Promise<void> {
  await ctx.supabase
    .from("org_members")
    .delete()
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId);
  revalidatePath("/settings/members");
}

/** Set (or reset) a member's explicit permission overrides. */
export async function setMemberPermissions(formData: FormData): Promise<void> {
  const ctx = await getOrgContext();
  if ("error" in ctx) return;
  if (!ctx.can("members.manage")) return;
  const userId = String(formData.get("user_id") ?? "");
  if (!userId || userId === ctx.user.id) return; // can't edit own permissions

  // Never override an owner — they always have everything.
  const { data: target } = await ctx.supabase
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!target || (target.role as string) === "owner") return;

  const reset = String(formData.get("reset") ?? "") === "1";
  const valid = new Set(ALL_PERMISSIONS as readonly string[]);
  const permissions = reset
    ? null
    : formData
        .getAll("perm")
        .map(String)
        .filter((p) => valid.has(p));

  await ctx.supabase
    .from("org_members")
    .update({ permissions })
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId);

  revalidatePath("/settings/members");
  // Their effective access changed — bust their cached layout/nav on next load.
  revalidatePath("/", "layout");
}

// ─── API KEYS ──────────────────────────────────────────────────

export async function createApiKey(_prev: unknown, formData: FormData) {
  const ctx = await getOrgContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("settings.manage")) {
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
  if (!ctx.can("settings.manage")) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/settings/api-keys");
}
