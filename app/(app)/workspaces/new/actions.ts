"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { CURRENT_WORKSPACE_COOKIE } from "@/lib/currentWorkspace";
import { CURRENT_FACILITY_COOKIE } from "@/lib/currentFacility";
import { provisionWorkspaceFromWizard } from "@/lib/workspace/provision";
import type { WorkspaceCreateState } from "@/lib/workspace/types";

/**
 * Create a second (or third, etc.) workspace for an already-onboarded user
 * from the same wizard as onboarding. Shares the provisioner with
 * `setUpWorkspace`; the only differences are no first-time guard, and a
 * final step that switches the workspace cookie so the user lands in the
 * new org as soon as the wizard navigates home.
 */
export async function createAdditionalWorkspace(
  _prev: WorkspaceCreateState | undefined,
  formData: FormData
): Promise<WorkspaceCreateState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Your session expired. Sign in again to continue." };
  }

  const result = await provisionWorkspaceFromWizard(formData, {
    user,
    requireNoMembership: false,
    logTag: "create-workspace",
  });
  if (result.kind === "already_member") {
    return { error: "Couldn't create the workspace. Try again." };
  }
  if (result.kind === "error") return { error: result.error };

  // Switch every server component to the new org; the previous facility
  // selection doesn't apply there.
  const cookieStore = await cookies();
  cookieStore.set(CURRENT_WORKSPACE_COOKIE, result.orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  cookieStore.delete(CURRENT_FACILITY_COOKIE);

  revalidatePath("/", "layout");
  return result.state;
}
