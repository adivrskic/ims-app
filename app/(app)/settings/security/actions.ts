"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/data/user";

/**
 * Revoke a device session. Sessions belong to the user (not an org), so this is
 * scoped by user_id rather than org_id. The revoked device is signed out on its
 * next page load (the layout checks revoked_at via recordDeviceSession).
 */
export async function revokeDeviceSession(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) return;
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;

  const admin = createAdminClient();
  await admin
    .from("user_sessions")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id);

  revalidatePath("/settings/security");
}
