"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function acceptInvite(
  token: string
): Promise<{ error?: string } | void> {
  if (!token || token.length < 8) {
    return { error: "Invalid invite token" };
  }

  // Must be signed in.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
  }

  // Re-validate the invite — page-side checks were UX, this is the gate.
  const admin = createAdminClient();
  const { data: invite, error: lookupErr } = await admin
    .from("org_invites")
    .select("id, org_id, email, role, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();
  if (lookupErr) return { error: lookupErr.message };
  if (!invite) return { error: "Invite not found or already revoked" };
  if (invite.accepted_at)
    return { error: "This invite has already been accepted" };
  if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
    return { error: "This invite has expired" };
  }
  if (invite.email.toLowerCase() !== (user!.email ?? "").toLowerCase()) {
    return {
      error: `This invite is for ${invite.email}. Sign in with that address to accept.`,
    };
  }

  // Check user isn't already a member of the org (idempotence).
  const { data: existing } = await admin
    .from("org_members")
    .select("user_id")
    .eq("org_id", invite.org_id)
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!existing) {
    // Upsert profile in case it doesn't exist yet (rare — they signed in
    // already so usually it does, but defensive).
    await admin.from("profiles").upsert(
      {
        id: user!.id,
        email: user!.email,
        full_name:
          (user!.user_metadata?.full_name as string | undefined) ?? null,
      },
      { onConflict: "id" }
    );

    const { error: memberErr } = await admin.from("org_members").insert({
      org_id: invite.org_id,
      user_id: user!.id,
      role: invite.role,
    });
    if (memberErr) return { error: memberErr.message };
  }

  // Mark accepted (idempotent — fine if already set from a previous attempt).
  await admin
    .from("org_invites")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id);

  revalidatePath("/", "layout");
  redirect("/");
}
