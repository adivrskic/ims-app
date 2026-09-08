"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/currentWorkspace";
import { CURRENT_FACILITY_COOKIE } from "@/lib/currentFacility";

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
 * Dismiss the overview's getting-started checklist for the current user.
 * Per-user (profiles.dashboard_prefs, self-update RLS) — one teammate
 * dismissing it doesn't hide it for the rest of the workspace.
 */
export async function dismissGettingStarted(
  _formData?: FormData
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Merge-write: fetch the current prefs so future fields survive.
  const { data: profile } = await supabase
    .from("profiles")
    .select("dashboard_prefs")
    .eq("id", user.id)
    .maybeSingle();
  const prefs =
    (profile?.dashboard_prefs as Record<string, unknown> | null) ?? {};

  await supabase
    .from("profiles")
    .update({ dashboard_prefs: { ...prefs, dismissed_getting_started: true } })
    .eq("id", user.id);

  revalidatePath("/");
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
