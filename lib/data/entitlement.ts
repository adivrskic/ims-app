import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isEntitled,
  resolveEntitlement,
  type Entitlement,
} from "@/lib/entitlement";

/**
 * Server-side loader for a workspace's entitlement. The rules live in
 * lib/entitlement.ts; this file only fetches the two facts they need.
 *
 * Request-cached with React cache(), so the (app) layout, a page and an action
 * in the same request share one lookup. Deliberately NOT cross-request cached:
 * when the Stripe webhook marks a workspace paid, the very next request must
 * see it.
 *
 * Reads go through the service-role client with an explicit org filter. Every
 * caller passes an orgId it resolved from a validated membership (or an API
 * key), and the admin client is needed because org_subscriptions' RLS predates
 * this repo and can't be verified from it — if members can't read that row, a
 * user-scoped read would see "no subscription" and lock a PAYING workspace's
 * members out the moment its trial clock ran down.
 *
 * FAILS OPEN. Any read failure — the trial-clock migration not applied yet (no
 * such column), a network blip, a missing service-role key — resolves as "no
 * trial clock", which is never gated. Being briefly too generous is
 * recoverable; locking a customer out of their warehouse is not.
 */

const loggedFailures = new Set<string>();

/** Log each distinct failure once per server instance — a missing column would
 *  otherwise log on every request between deploy and migration. */
function logFailOpen(message: string) {
  if (loggedFailures.has(message)) return;
  loggedFailures.add(message);
  console.error(`[entitlement] ${message} — failing open (no trial gate).`);
}

export const getOrgEntitlement = cache(
  async (orgId: string): Promise<Entitlement> => {
    const now = Date.now();
    const noClock = () =>
      resolveEntitlement({ trialStartedAt: null, subscriptionStatus: null }, now);

    try {
      const admin = createAdminClient();
      const [org, subscription] = await Promise.all([
        admin
          .from("orgs")
          .select("trial_started_at")
          .eq("id", orgId)
          .maybeSingle(),
        admin
          .from("org_subscriptions")
          .select("status")
          .eq("org_id", orgId)
          .maybeSingle(),
      ]);

      if (org.error) {
        logFailOpen(`orgs.trial_started_at unreadable: ${org.error.message}`);
        return noClock();
      }
      if (subscription.error) {
        logFailOpen(`org_subscriptions unreadable: ${subscription.error.message}`);
        return noClock();
      }

      return resolveEntitlement(
        {
          trialStartedAt:
            (org.data as { trial_started_at: string | null } | null)
              ?.trial_started_at ?? null,
          subscriptionStatus:
            (subscription.data as { status: string | null } | null)?.status ??
            null,
        },
        now
      );
    } catch (err) {
      logFailOpen(
        `lookup threw: ${err instanceof Error ? err.message : String(err)}`
      );
      return noClock();
    }
  }
);

/** Has this workspace's trial run out unpaid? The gate for server actions and exports. */
export async function isTrialExpired(orgId: string): Promise<boolean> {
  return !isEntitled(await getOrgEntitlement(orgId));
}

/**
 * What a server action returns when its workspace's trial has run out. Worded
 * for both audiences: owners can act on it, members learn whom to ask.
 */
export const TRIAL_ENDED_ERROR =
  "This workspace's free trial has ended, so changes can't be saved. An owner can choose a plan in Settings → Billing.";

/**
 * 402 for the session-authenticated CSV exports under (app). The pages that
 * link to them are already gated; this covers a bookmarked or pasted URL.
 */
export function trialEndedExportResponse(): Response {
  return new Response(
    "This workspace's free trial has ended. Choose a plan in Settings → Billing to restore exports.",
    { status: 402, headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}

/**
 * Pathname of the page being rendered, from the x-url header the middleware
 * stamps (layouts get no pathname prop — same source as lib/kiosk.ts). null
 * when the header is missing: callers must treat that as "unknown", never as
 * a particular route.
 */
export async function getRequestPathname(): Promise<string | null> {
  const url = (await headers()).get("x-url");
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}
