"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_FACILITY_COOKIE } from "@/lib/currentFacility";

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
