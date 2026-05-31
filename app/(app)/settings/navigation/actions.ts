"use server";

import { revalidatePath } from "next/cache";
import { getActionContext } from "@/lib/data/actionContext";
import { createAdminClient } from "@/lib/supabase/admin";
import { isIndustrySlug, ALWAYS_PRIMARY } from "@/lib/industries";

/**
 * Save the current user's sidenav prefs (per-user, on profiles.nav_prefs).
 * ALWAYS_PRIMARY keys (overview, settings) can never be hidden — guarded here
 * so a saved pref can't make Settings unreachable.
 */
export async function saveNavPrefs(prefs: {
  order: string[];
  hidden: string[];
}): Promise<{ error?: string; success?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };

  const locked = new Set<string>(ALWAYS_PRIMARY);
  const order = Array.isArray(prefs.order)
    ? prefs.order.filter((k) => typeof k === "string")
    : [];
  const hidden = (
    Array.isArray(prefs.hidden)
      ? prefs.hidden.filter((k) => typeof k === "string")
      : []
  ).filter((k) => !locked.has(k));

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ nav_prefs: { order, hidden } })
    .eq("id", ctx.user.id);
  if (error) return { error: error.message };

  // Layout reads nav_prefs for the SideRail — refresh the whole subtree.
  revalidatePath("/", "layout");
  return { success: "Navigation saved" };
}

/** Clear the user's prefs → fall back to the workspace's industry defaults. */
export async function resetNavPrefs(): Promise<{ error?: string }> {
  const ctx = await getActionContext();
  if ("error" in ctx) return { error: ctx.error };
  const { error } = await ctx.supabase
    .from("profiles")
    .update({ nav_prefs: null })
    .eq("id", ctx.user.id);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return {};
}

/**
 * Update the workspace's industry (owner/admin only). Changes the default nav
 * for members who haven't customized. Uses the admin client (role-gated here,
 * org_id-filtered) since orgs has no member-facing UPDATE policy.
 */
export async function updateIndustry(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("settings.manage")) return;

  const raw = String(formData.get("industry") ?? "").trim();
  const industry = isIndustrySlug(raw) ? raw : null;

  const admin = createAdminClient();
  await admin.from("orgs").update({ industry }).eq("id", ctx.orgId);

  revalidatePath("/", "layout");
}
