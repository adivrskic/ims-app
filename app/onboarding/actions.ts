"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { provisionWorkspaceFromWizard } from "@/lib/workspace/provision";
import type {
  WorkspaceCreateState,
  WorkspaceInvite,
} from "@/lib/workspace/types";

export type OnboardingState = WorkspaceCreateState;
export type OnboardingInvite = WorkspaceInvite;

/**
 * Bootstrap a new workspace for a self-signed-up user from the onboarding
 * wizard's answers. The shared provisioner (lib/workspace/provision.ts)
 * validates, provisions atomically and sends invites; this action owns the
 * first-time-only preconditions:
 *   - User is authenticated (Supabase auth.getUser)
 *   - User has zero existing memberships — checked here for a clean
 *     redirect, and enforced AGAIN inside the RPC under an advisory lock
 *     (p_require_no_membership) so a two-tab double submit cannot mint two
 *     orgs.
 */
export async function setUpWorkspace(
  _prev: OnboardingState | undefined,
  formData: FormData
): Promise<OnboardingState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Sign in again to continue." };
  }

  const { data: existingMembership } = await supabase
    .from("org_members")
    .select("org_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  if (existingMembership) {
    // Already onboarded — don't run again, just send them home.
    redirect("/");
  }

  const result = await provisionWorkspaceFromWizard(formData, {
    user,
    requireNoMembership: true,
    logTag: "onboarding",
  });
  // The in-RPC double-submit guard: the other tab already created it.
  if (result.kind === "already_member") redirect("/");
  if (result.kind === "error") return { error: result.error };

  revalidatePath("/", "layout");
  return result.state;
}
