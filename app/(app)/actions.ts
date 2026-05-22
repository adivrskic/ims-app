"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_FACILITY_COOKIE } from "@/lib/currentFacility";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/currentWorkspace";

export async function markNotificationRead(id: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/", "layout");
}

export async function markAllNotificationsRead(): Promise<void> {
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
 * Server action invoked from the sidebar's facility switcher popover.
 *
 * FormData key "id" can be:
 *   - "all"   → explicit all-facilities mode
 *   - <uuid>  → switch to that facility
 *   - ""      → clear the cookie (revert to default resolution)
 *
 * After updating the cookie, revalidates the entire app layout so
 * getCurrentFacility() resolves to the new selection on the next render
 * and the UI reflects the change immediately.
 *
 * Note: no server-side validation of the facility ID — RLS prevents
 * any actual data leakage if a bogus UUID is set, and getCurrentFacility
 * ignores cookie values that don't match a visible facility.
 */
export async function setCurrentFacility(formData: FormData): Promise<void> {
  const raw = String(formData.get("id") ?? "").trim();
  const cookieStore = await cookies();

  const cookieOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };

  if (raw === "all") {
    cookieStore.set(CURRENT_FACILITY_COOKIE, "all", cookieOpts);
  } else if (raw) {
    cookieStore.set(CURRENT_FACILITY_COOKIE, raw, cookieOpts);
  } else {
    cookieStore.delete(CURRENT_FACILITY_COOKIE);
  }

  revalidatePath("/", "layout");
}

/**
 * Server action invoked from the sidebar's WorkspaceSwitcher.
 *
 * Verifies that the signed-in user is actually a member of the target
 * workspace, then sets the workspace cookie and revalidates the whole
 * app shell so every cached fetcher reads the new org_id on the next
 * render.
 *
 * Also clears the current-facility cookie — facilities are scoped to a
 * workspace, so a facility selected in workspace A doesn't carry over
 * to workspace B (would have rendered "all facilities" anyway due to
 * RLS, but explicit reset feels cleaner).
 *
 * Returns `{ error }` on failure (rendered inline by the client). On
 * success, the caller `router.refresh()`es; the revalidatePath here
 * does the actual cache busting.
 */
export async function switchWorkspace(
  formData: FormData
): Promise<{ error?: string }> {
  const orgId = String(formData.get("org_id") ?? "").trim();
  if (!orgId) return { error: "Workspace ID is required" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };

  // Confirm membership before honoring the switch. RLS would block data
  // leaks anyway, but failing fast here gives the user a real error
  // instead of an empty-looking workspace.
  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!membership) {
    return { error: "You don't have access to that workspace" };
  }

  const cookieStore = await cookies();
  const cookieOpts = {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
  };

  cookieStore.set(CURRENT_WORKSPACE_COOKIE, orgId, cookieOpts);
  // Reset facility scope — the previously selected facility belongs to
  // a different workspace.
  cookieStore.delete(CURRENT_FACILITY_COOKIE);

  revalidatePath("/", "layout");
  return {};
}
