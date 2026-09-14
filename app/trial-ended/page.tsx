import { redirect } from "next/navigation";
import { ExternalLink, Hourglass, LogOut } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { CornerLink } from "@/components/ui/CornerButton";
import { ThemeToggle } from "@/components/nav/ThemeToggle";
import {
  WorkspaceSwitcher,
  type WorkspaceOption,
} from "@/components/nav/WorkspaceSwitcher";
import { signOut } from "@/app/(auth)/actions";
import { createClient } from "@/lib/supabase/server";
import {
  getActiveMembership,
  getCurrentUser,
  getMemberships,
} from "@/lib/data/user";
import { getOrgEntitlement } from "@/lib/data/entitlement";
import { TRIAL_DAYS } from "@/lib/entitlement";
import { effectivePermissions } from "@/lib/permissions";
import { stripeConfigured } from "@/lib/stripe";
import { CONTACT_SALES_URL } from "@/lib/billing/plans";

export const metadata = { title: "Trial ended" };

/**
 * The one screen every (app) page shows once a workspace's free trial has run
 * out unpaid. The gate is app/(app)/layout.tsx (plus TrialGuard for client-side
 * navigation); the rules are lib/entitlement.ts. This page lives outside the
 * (app) group so it is never gated itself.
 *
 * Nothing in the gate touches the workspace's data: it stays exactly as it was
 * and is all there again the moment a plan is active.
 *
 * Reachable from here: billing (billing.manage only), talk to us, the user's
 * other workspaces, and sign-out.
 */
export default async function TrialEndedPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/trial-ended");

  const [memberships, active] = await Promise.all([
    getMemberships(),
    getActiveMembership(),
  ]);
  if (!active) redirect("/onboarding");

  const entitlement = await getOrgEntitlement(active.org_id);
  // Only an expired workspace belongs here. A bookmark, a tab left open while
  // someone paid, or a switch to a workspace in good standing goes home.
  if (entitlement.state !== "expired") redirect("/");

  const canManageBilling = effectivePermissions(
    active.role,
    active.permissions
  ).has("billing.manage");
  const billingReady = stripeConfigured();
  const workspaceName = active.org?.name ?? "This workspace";
  const endedOn = entitlement.trialEndsAt
    ? new Date(entitlement.trialEndsAt).toLocaleDateString(undefined, {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null;
  const owners = canManageBilling ? [] : await workspaceOwners(active.org_id);

  const workspaces: WorkspaceOption[] = memberships.map((m) => ({
    id: m.org?.id ?? m.org_id,
    name: m.org?.name ?? "Unknown",
    slug: m.org?.slug ?? "",
    role: m.role,
  }));
  const current: WorkspaceOption = workspaces.find(
    (w) => w.id === active.org_id
  ) ?? {
    id: active.org_id,
    name: workspaceName,
    slug: active.org?.slug ?? "",
    role: active.role,
  };

  return (
    <main className="min-h-screen flex flex-col relative">
      <div
        className="absolute inset-0 dot-grid opacity-40 pointer-events-none"
        aria-hidden
      />
      <header className="relative z-10 px-32 md:px-48 py-24 flex items-center justify-between gap-12">
        {/* Deliberately NOT a home link: "/" only brings an expired workspace
            straight back here. */}
        <span className="inline-flex items-center gap-10 text-text">
          <Logo size={20} />
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 12,
              letterSpacing: "2.5px",
              fontWeight: 500,
            }}
          >
            Nautilus
          </span>
        </span>
        <div className="flex items-center gap-16">
          <ThemeToggle />
          <form action={signOut}>
            <button
              type="submit"
              className="inline-flex items-center gap-6 mono-sm text-text-muted hover:text-text transition-colors"
            >
              <LogOut size={11} strokeWidth={1.5} aria-hidden />
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="relative z-10 flex-1 flex items-center justify-center px-20 py-40">
        <div className="w-full max-w-[520px] hairline bg-[var(--surface)] p-32 flex flex-col gap-20 brackets">
          <header className="flex items-start gap-14">
            <span
              className="w-40 h-40 hairline-subtle bg-[var(--warning-dim)] flex items-center justify-center text-[var(--warning)] shrink-0"
              aria-hidden
            >
              <Hourglass size={16} strokeWidth={1.5} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="label-text mb-4" style={{ color: "var(--warning)" }}>
                Free trial ended
              </p>
              <h1
                style={{
                  fontFamily: "var(--display)",
                  fontSize: 22,
                  fontWeight: 500,
                  color: "var(--text)",
                  margin: "0 0 8px",
                }}
              >
                {workspaceName}&apos;s trial is over
              </h1>
              <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
                The {TRIAL_DAYS}-day free trial{" "}
                {endedOn ? `ended on ${endedOn}` : "has ended"}. Your data is
                safe: nothing has been changed or deleted, and it&apos;s all
                here the moment the workspace is on a plan.
              </p>
            </div>
          </header>

          {canManageBilling ? (
            <footer className="flex flex-col gap-12 hairline-t pt-16">
              <p
                className="mono-sm text-text-secondary"
                style={{ lineHeight: 1.6 }}
              >
                {billingReady
                  ? "Choose a plan to restore access for everyone in the workspace — or talk to us if you need more time or a custom setup."
                  : "Talk to us and we'll get the workspace onto a plan."}
              </p>
              <div className="flex items-center gap-10 flex-wrap">
                {billingReady && (
                  <CornerLink href="/settings/billing" variant="primary" size="sm">
                    Choose a plan →
                  </CornerLink>
                )}
                <CornerLink
                  href={CONTACT_SALES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  size="sm"
                >
                  <ExternalLink size={11} strokeWidth={1.5} />
                  Talk to us
                </CornerLink>
              </div>
            </footer>
          ) : (
            <footer className="flex flex-col gap-10 hairline-t pt-16">
              <p
                className="mono-sm text-text-secondary"
                style={{ lineHeight: 1.6 }}
              >
                Ask a workspace owner to choose a plan in Settings → Billing.
                That restores access for everyone.
              </p>
              {owners.length > 0 && (
                <div className="flex flex-col gap-4">
                  <p className="label-text">
                    {owners.length === 1 ? "Workspace owner" : "Workspace owners"}
                  </p>
                  <ul className="flex flex-col gap-2">
                    {owners.map((owner, i) => (
                      <li key={`${i}-${owner}`} className="mono-sm text-text">
                        {owner}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </footer>
          )}

          {workspaces.length > 1 && (
            <div className="flex flex-col gap-8 hairline-t pt-16">
              <p className="label-text">Switch workspace</p>
              <div className="max-w-[280px]">
                <WorkspaceSwitcher current={current} workspaces={workspaces} />
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

interface OwnerProfile {
  email: string | null;
  full_name: string | null;
}

/**
 * Who a member should ask. Best-effort, through the member's own RLS-scoped
 * view of the workspace — the same embed Settings → Members reads. Any failure
 * just drops the list, and the "ask an owner" copy stands on its own.
 */
async function workspaceOwners(orgId: string): Promise<string[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("org_members")
      .select("profile:profiles ( email, full_name )")
      .eq("org_id", orgId)
      .eq("role", "owner");
    return (
      (data ?? []) as Array<{ profile: OwnerProfile | OwnerProfile[] | null }>
    )
      .map((row) => (Array.isArray(row.profile) ? row.profile[0] : row.profile))
      .map((p) =>
        p?.full_name && p.email
          ? `${p.full_name} (${p.email})`
          : p?.full_name || p?.email || ""
      )
      .filter((owner) => owner.length > 0);
  } catch {
    return [];
  }
}
