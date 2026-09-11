import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser, getProfile } from "@/lib/data/user";
import { OnboardingWizard } from "@/app/onboarding/OnboardingWizard";
import { createAdditionalWorkspace } from "./actions";

export const metadata = { title: "New workspace" };

/**
 * Create-additional-workspace flow. Lives inside (app) so the user keeps
 * their existing chrome (sidebar, etc.) — they're spinning up a second org
 * while already inside the dashboard. It is the SAME wizard as first-time
 * onboarding (industry, activities, priorities, size all drive the new
 * workspace's sidebar and dashboard); only the server action differs, and
 * it switches the active workspace on success.
 *
 * The original `/onboarding` route guards on zero-memberships and
 * redirects existing users away. This route is the inverse: it's the
 * flow for users who already have at least one workspace.
 */
export default async function NewWorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const profile = await getProfile();
  const email = profile?.email ?? user.email ?? "";
  const fullName =
    profile?.full_name ??
    (user.user_metadata?.full_name as string | undefined) ??
    null;

  return (
    <div className="flex flex-col gap-24 max-w-[640px]">
      <Link
        href="/"
        className="inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors self-start"
      >
        <ArrowLeft size={11} strokeWidth={1.5} />
        Back to overview
      </Link>

      <OnboardingWizard
        variant="additional"
        fullName={fullName}
        email={email}
        userId={user.id}
        action={createAdditionalWorkspace}
      />
    </div>
  );
}
