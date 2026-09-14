/**
 * Workspace entitlement — the ONE place that decides whether a workspace may
 * use the product.
 *
 * Every gate asks this module and nothing else: the (app) layout and the
 * /trial-ended screen, server actions (via getActionContext), the CSV exports,
 * the public API's 402, the billing page and the shell's trial pill. Nothing
 * else compares trial dates or subscription statuses — and nothing gates on a
 * plan tier: `orgs.tier` is a label (staff set it at onboarding, and owners can
 * edit their own org row), not proof that anyone paid.
 *
 * Pure and dependency-free (no server-only, no clock of its own): the server
 * resolves once per request, client components re-evaluate that result as the
 * clock moves, and the tests pin the rules with a fixed `now`.
 *
 * Inputs are two facts about a workspace:
 *   - orgs.trial_started_at — when its free trial started; NULL for every
 *     workspace that existed before trials shipped (see
 *     supabase/migrations/20260913120000_trial_clock.sql);
 *   - org_subscriptions.status — its Stripe subscription status, or no row.
 *
 * Precedence, first match wins:
 *   1. paid          — Stripe status active, trialing or past_due. Never gated,
 *                      whatever the trial clock says. past_due is paid on
 *                      purpose: Stripe is still retrying the card, and locking
 *                      a paying customer out mid-dunning is how they churn.
 *   2. grandfathered — no trial clock, or one that can't be read. Never gated.
 *   3. trial         — on the clock and inside the 7 days.
 *   4. expired       — on the clock, past the 7 days, not paid. The ONLY state
 *                      that loses access.
 *
 * Time is compared in epoch milliseconds, never as calendar days in some
 * timezone, so a trial is exactly 7 × 24 hours wherever the server or the
 * browser is, and whether or not a DST change falls inside it.
 */

/** Length of the no-card free trial every new workspace gets. */
export const TRIAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

/** The trial in milliseconds: 168 hours exactly, never "7 calendar days". */
export const TRIAL_LENGTH_MS = TRIAL_DAYS * DAY_MS;

export type EntitlementState = "grandfathered" | "trial" | "paid" | "expired";

export interface Entitlement {
  state: EntitlementState;
  /**
   * When the free trial ends (or ended), as an ISO-8601 UTC string. null when
   * the workspace has no trial clock (grandfathered, or paid without one).
   */
  trialEndsAt: string | null;
  /**
   * Whole days left, rounded UP — 7 on the day the workspace is created, 1
   * during its final 24 hours. 0 once expired; null when no clock is running
   * (grandfathered, paid).
   */
  daysLeft: number | null;
}

export interface EntitlementInput {
  /** orgs.trial_started_at. null/undefined → no trial clock (grandfathered). */
  trialStartedAt: string | Date | null | undefined;
  /** org_subscriptions.status. null/undefined → the workspace has no subscription. */
  subscriptionStatus: string | null | undefined;
}

/**
 * Stripe subscription statuses that count as paying. Everything else —
 * canceled, unpaid, incomplete, incomplete_expired, paused — falls back to the
 * trial clock.
 */
const PAID_SUBSCRIPTION_STATUSES: ReadonlySet<string> = new Set([
  "active",
  "trialing",
  "past_due",
]);

export function isPaidSubscriptionStatus(
  status: string | null | undefined
): boolean {
  return typeof status === "string" && PAID_SUBSCRIPTION_STATUSES.has(status);
}

/**
 * A timestamp with no offset ("2026-09-13T12:00:00") is read as UTC. JS reads
 * those in the host's local zone, so the same row would end a trial at a
 * different instant on a server in Ohio than on one in Frankfurt. Postgres
 * always sends an offset for timestamptz; this is the belt to that brace.
 */
const NO_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/;

function toMs(value: string | Date | number | null | undefined): number | null {
  if (value == null) return null;
  let ms: number;
  if (value instanceof Date) {
    ms = value.getTime();
  } else if (typeof value === "number") {
    ms = value;
  } else {
    const s = value.trim();
    ms = Date.parse(NO_OFFSET.test(s) ? `${s.replace(" ", "T")}Z` : s);
  }
  return Number.isFinite(ms) ? ms : null;
}

/** ISO string for an instant, or null when it falls outside what Date can hold. */
function isoOrNull(ms: number): string | null {
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A workspace on the clock: a trial until the end instant, expired from it on. */
function onTheClock(trialEndsAtMs: number, nowMs: number, trialEndsAt: string): Entitlement {
  const msLeft = trialEndsAtMs - nowMs;
  // The end instant itself is already outside the trial: 7 × 24 hours after
  // the start, and not a millisecond more.
  if (msLeft <= 0) return { state: "expired", trialEndsAt, daysLeft: 0 };
  return { state: "trial", trialEndsAt, daysLeft: Math.ceil(msLeft / DAY_MS) };
}

/**
 * Decide a workspace's entitlement at `now`. Never throws, and anything it
 * can't read resolves to a state that keeps access — unknown never locks a
 * customer out.
 */
export function resolveEntitlement(
  input: EntitlementInput,
  now: Date | number
): Entitlement {
  const startedMs = toMs(input.trialStartedAt);
  const trialEndsAtMs = startedMs == null ? null : startedMs + TRIAL_LENGTH_MS;
  const trialEndsAt = trialEndsAtMs == null ? null : isoOrNull(trialEndsAtMs);

  if (isPaidSubscriptionStatus(input.subscriptionStatus)) {
    return { state: "paid", trialEndsAt, daysLeft: null };
  }

  const nowMs = toMs(now);
  if (trialEndsAtMs == null || trialEndsAt == null || nowMs == null) {
    return { state: "grandfathered", trialEndsAt: null, daysLeft: null };
  }

  return onTheClock(trialEndsAtMs, nowMs, trialEndsAt);
}

/**
 * Re-evaluate an entitlement resolved earlier at a later instant — for client
 * components that outlive the request that resolved it (a tab left open across
 * the end of a trial). Only a running trial changes with the clock: paid and
 * expired need a server round-trip to change, and grandfathered never does.
 */
export function entitlementAt(e: Entitlement, now: Date | number): Entitlement {
  if (e.state !== "trial") return e;
  const trialEndsAtMs = toMs(e.trialEndsAt);
  const nowMs = toMs(now);
  if (trialEndsAtMs == null || nowMs == null || e.trialEndsAt == null) return e;
  return onTheClock(trialEndsAtMs, nowMs, e.trialEndsAt);
}

/** May this workspace use the product? False only once a trial has run out unpaid. */
export function isEntitled(e: Pick<Entitlement, "state">): boolean {
  return e.state !== "expired";
}

/** "1 day left" / "6 days left" — shared by the shell pill and the billing page. */
export function formatDaysLeft(daysLeft: number): string {
  return `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
}

/**
 * (app) routes an expired workspace can still open: billing, so an owner can
 * pay (Stripe Checkout and the billing portal both return there), and creating
 * a new workspace, which gets its own trial. Every other (app) page lands on
 * /trial-ended. Routes outside the (app) group — auth, invites, onboarding,
 * /trial-ended itself, /admin, cron and webhooks — never meet the gate.
 */
export const TRIAL_EXEMPT_PATHS = ["/settings/billing", "/workspaces/new"] as const;

export function isTrialExemptPath(pathname: string): boolean {
  return TRIAL_EXEMPT_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}
