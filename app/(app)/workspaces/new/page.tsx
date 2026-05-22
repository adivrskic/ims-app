import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";
import { getCurrentUser, getProfile } from "@/lib/data/user";
import { NewWorkspaceForm } from "./NewWorkspaceForm";

export const metadata = { title: "New workspace" };

/**
 * Create-additional-workspace flow. Lives inside (app) so the user
 * keeps their existing chrome (sidebar, etc.) — they're spinning up a
 * second org while already inside the dashboard, not onboarding from
 * scratch.
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

  return (
    <div className="flex flex-col gap-32 max-w-[760px]">
      <Link
        href="/"
        className="inline-flex items-center gap-6 text-text-muted hover:text-text transition-colors w-fit"
      >
        <ArrowLeft size={11} strokeWidth={1.5} />
        <span className="label-text">Back</span>
      </Link>

      <PageHeader
        eyebrow="Workspaces"
        title="Create a new workspace"
        description="Spin up a separate workspace for another company, location, or business unit. Each workspace has its own inventory, facilities, team, and integrations — they don't share data."
      />

      <NewWorkspaceForm email={email} />
    </div>
  );
}
