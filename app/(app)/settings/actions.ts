"use server";

import { revalidatePath } from "next/cache";
import { randomBytes, createHash } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { getActionContext } from "@/lib/data/actionContext";
import { sendInviteEmail } from "@/lib/email/invite";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ALL_PERMISSIONS,
  defaultPermissionsFor,
  type Permission,
} from "@/lib/permissions";
import { sanitizeScopes } from "@/lib/apiScopes";
import { appUrl as resolveAppUrl } from "@/lib/appUrl";
import { EMAIL_RE } from "@/lib/modules";
import { rateLimit } from "@/lib/rateLimit";

// ─── MEMBERS ───────────────────────────────────────────────────

export async function inviteMember(_prev: unknown, formData: FormData) {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "member");

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return { error: "Enter a valid email" };
  }
  if (!["admin", "member"].includes(role)) {
    return { error: "Invalid role" };
  }
  if (!ctx.can("members.manage")) {
    return { error: "Only admins can invite" };
  }
  // A member who holds members.manage may invite members, but minting an
  // admin (who inherits every permission) is reserved for owners and admins —
  // otherwise members.manage alone escalates to full admin via a proxy.
  if (role === "admin" && ctx.role !== "owner" && ctx.role !== "admin") {
    return { error: "Only owners and admins can invite admins" };
  }

  // Cap invites per workspace per day: the invite path sends mail on behalf
  // of the workspace, so an unbounded loop is a spam vector.
  const rl = await rateLimit(`invite:${ctx.orgId}`, 50, 86400);
  if (!rl.allowed) {
    return {
      error: "This workspace has sent its daily limit of invites — try again tomorrow",
    };
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
  if (sent.ok) return { success: `Invite emailed to ${email}` };

  /* The send failed but the invite row is valid, so the link still works.
     Hand it back for the form to display: telling an admin to "share the
     link manually" without showing them the link left this path with no
     way to complete the invite at all — the only recourse was reading it
     out of the database. Every other invite path (onboarding, new
     workspace, bulk CSV) already surfaces copy-able links. */
  return {
    success: `Invite created for ${email}, but the email could not be sent — copy the link below and send it yourself.`,
    inviteUrl: `${resolveAppUrl()}/invite/${token}`,
    inviteEmail: email,
  };
}

export async function revokeInvite(formData: FormData) {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("members.manage")) return;
  const id = String(formData.get("id") ?? "");
  await ctx.supabase
    .from("org_invites")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId);
  revalidatePath("/settings/members");
}

export async function removeMember(formData: FormData) {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("members.manage")) return;
  const userId = String(formData.get("user_id") ?? "");
  if (!userId) return;
  if (userId === ctx.user.id) return; // can't remove self

  /* Owner protection. The UI hides Remove for owners, but this action is a
     plain server action — a crafted POST from anyone holding members.manage
     could otherwise delete an owner, and deleting the LAST owner strands the
     workspace with nobody able to manage billing or membership (there is no
     way to promote a new owner from the UI). Mirrors the guards that
     setMemberPermissions already applies below. */
  const { data: target } = await ctx.supabase
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!target) return; // not a member of this org

  if ((target as { role: string }).role === "owner") {
    // Only an owner may remove a fellow owner…
    if (ctx.role !== "owner") return;
    // …and never the last one.
    const { count } = await ctx.supabase
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", ctx.orgId)
      .eq("role", "owner");
    if ((count ?? 0) <= 1) return;
  }

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

/**
 * Set (or reset) a member's explicit permission overrides.
 *
 * Returns an error string when the request is refused, or undefined on
 * success / silent no-op (the form treats both the same way today).
 */
export async function setMemberPermissions(
  formData: FormData
): Promise<string | undefined> {
  const ctx = await getActionContext();
  if ("error" in ctx) return ctx.error;
  if (!ctx.can("members.manage")) return "You can't manage members";
  const userId = String(formData.get("user_id") ?? "");
  if (!userId || userId === ctx.user.id) return; // can't edit own permissions

  // Never override an owner — they always have everything.
  const { data: target } = await ctx.supabase
    .from("org_members")
    .select("role")
    .eq("user_id", userId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (!target) return;
  const targetRole = target.role as string;
  if (targetRole === "owner") return;
  // Admin-vs-admin guard: only an owner may edit a fellow admin's permissions, so
  // one admin can't strip another's access out from under them.
  if (targetRole === "admin" && ctx.role !== "owner") return;

  const reset = String(formData.get("reset") ?? "") === "1";
  const valid = new Set(ALL_PERMISSIONS as readonly string[]);
  const permissions = reset
    ? null
    : formData
        .getAll("perm")
        .map(String)
        .filter((p) => valid.has(p));

  // Submitting with every box unchecked writes [] — a full lockout that's almost
  // always an accident. Treat it as a no-op; remove the member to revoke access.
  if (permissions !== null && permissions.length === 0) return;

  // No escalation by proxy: unless the caller is an owner, every permission
  // they grant must be one they hold themselves. Resetting to the role default
  // is likewise refused when that default exceeds the caller's own set (a
  // member default is a subset of any admin's, so this only bites a trimmed
  // admin resetting a member).
  if (ctx.role !== "owner") {
    const granted =
      permissions ?? (defaultPermissionsFor(targetRole) as readonly string[]);
    const beyond = granted.filter(
      (p) => !ctx.permissions.has(p as Permission)
    );
    if (beyond.length > 0) {
      return `You can't grant permissions you don't hold yourself (${beyond.join(
        ", "
      )})`;
    }
  }

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
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  if (!ctx.can("settings.manage")) {
    return { error: "Only admins can create keys" };
  }

  const name = String(formData.get("name") ?? "").trim();
  /* Validate against the canonical list — the routes enforce these strings,
     so an unrecognised one would mint a key that can never authorise
     anything. Unknown values are dropped rather than silently stored. */
  const scopes = sanitizeScopes(formData.getAll("scopes").map(String));

  if (!name) return { error: "Name is required" };
  if (scopes.length === 0) return { error: "Select at least one scope" };

  const raw = randomBytes(24).toString("base64url");
  const prefix = `nb_live_${raw.slice(0, 4)}`;
  const full = `${prefix}_${raw}`;
  const hash = createHash("sha256").update(full).digest("hex");

  /* The live app.api_keys table has SELECT and UPDATE (revoke) policies but
     no INSERT policy, so the session-scoped client is refused by RLS. The
     settings.manage check above is the authorisation; the insert goes through
     the service-role client with every column stamped from the verified
     context. (20261026120000_rls_hardening adds the policy; this keeps the
     action working either side of that deploy.) */
  const { error } = await createAdminClient().from("api_keys").insert({
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
  const ctx = await getActionContext();
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
