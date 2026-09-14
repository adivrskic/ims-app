import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import {
  CreditCard,
  ExternalLink,
  Receipt,
  Users,
  Calendar,
  Check,
  AlertTriangle,
  Hourglass,
} from "lucide-react";
import { stripeConfigured } from "@/lib/stripe";
import { CONTACT_SALES_URL, TIER_LABEL } from "@/lib/billing/plans";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getOrgEntitlement } from "@/lib/data/entitlement";
import {
  TRIAL_DAYS,
  formatDaysLeft,
  isPaidSubscriptionStatus,
} from "@/lib/entitlement";
import {
  getDefaultCard,
  getInvoices,
  getPlanPrices,
  type InvoiceInfo,
  type PlanPriceInfo,
} from "@/lib/billing/display";
import { startCheckout, openBillingPortal } from "./actions";

export const metadata = { title: "Billing · Settings" };

interface SubscriptionRow {
  tier: "pro" | "enterprise";
  seats: number;
  status: string;
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

function money(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

const NOTICE: Record<string, { tone: "info" | "danger"; text: string }> = {
  "checkout:success": {
    tone: "info",
    text: "Checkout complete — your subscription will update here once Stripe confirms it.",
  },
  "checkout:cancelled": {
    tone: "info",
    text: "Checkout cancelled — no changes were made.",
  },
  "error:billing_not_configured": {
    tone: "danger",
    text: "Billing isn't configured yet (Stripe keys missing).",
  },
  "error:no_customer": {
    tone: "danger",
    text: "No Stripe customer on file yet — start a plan first.",
  },
  "error:unknown_plan": {
    tone: "danger",
    text: "That plan isn't available.",
  },
  "error:checkout_failed": {
    tone: "danger",
    text: "Couldn't start checkout — try again.",
  },
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string; error?: string }>;
}) {
  const { checkout, error } = await searchParams;
  const ctx = await getCurrentOrgContext();
  // The (app) layout has already sent anyone without a workspace to onboarding.
  if (!ctx) return null;
  const supabase = await createClient();
  const configured = stripeConfigured();
  const canManageBilling = ctx.can("billing.manage");

  // Both reads are filtered to the ACTIVE workspace. Unfiltered, they returned
  // whatever RLS let through — for someone in two workspaces, possibly the
  // other one's subscription, and members counted across both.
  const [{ data: subRaw }, { count: memberCount }, entitlement] =
    await Promise.all([
      supabase
        .from("org_subscriptions")
        .select(
          "tier, seats, status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id"
        )
        .eq("org_id", ctx.orgId)
        .maybeSingle(),
      supabase
        .from("org_members")
        .select("user_id", { count: "exact", head: true })
        .eq("org_id", ctx.orgId),
      getOrgEntitlement(ctx.orgId),
    ]);

  const sub = subRaw as SubscriptionRow | null;
  const customerId = sub?.stripe_customer_id ?? null;

  // Real Stripe data (best-effort; helpers never throw).
  const [card, invoices, planPrices] = await Promise.all([
    configured && customerId ? getDefaultCard(customerId) : Promise.resolve(null),
    configured && customerId ? getInvoices(customerId) : Promise.resolve([]),
    configured ? getPlanPrices() : Promise.resolve([]),
  ]);

  const noticeKey = checkout
    ? `checkout:${checkout}`
    : error
    ? `error:${error}`
    : null;
  const notice = noticeKey ? NOTICE[noticeKey] : null;

  // "Has a plan" is the entitlement module's definition of paid: active,
  // trialing or past_due. A past_due workspace now sees its plan with Manage
  // billing to fix the card, rather than a plan picker that would start a
  // second subscription.
  const hasActivePlan = !!sub && isPaidSubscriptionStatus(sub.status);
  const onTrialClock =
    entitlement.state === "trial" || entitlement.state === "expired";
  const willCancel = !!sub?.cancel_at_period_end;
  const seatUsage = memberCount ?? 0;

  return (
    <div className="flex flex-col gap-40">
      {notice && (
        <div
          className={`hairline px-16 py-12 flex items-center gap-12 ${
            notice.tone === "danger"
              ? "border-[var(--danger-border)] bg-[var(--danger-dim)]"
              : "border-[var(--border-subtle)] bg-[var(--surface-2)]"
          }`}
        >
          {notice.tone === "danger" ? (
            <AlertTriangle
              size={14}
              strokeWidth={1.5}
              className="text-[var(--danger)] shrink-0"
            />
          ) : (
            <Check
              size={14}
              strokeWidth={1.5}
              className="text-[var(--accent)] shrink-0"
            />
          )}
          <p
            className={`mono-sm ${
              notice.tone === "danger" ? "text-[var(--danger)]" : "text-text-secondary"
            }`}
          >
            {notice.text}
          </p>
        </div>
      )}

      {!configured && (
        <div className="hairline bg-[var(--surface-2)] px-20 py-16">
          <p className="mono-sm text-text-muted">
            Billing isn&apos;t configured. Set <code>STRIPE_SECRET_KEY</code>,{" "}
            <code>STRIPE_WEBHOOK_SECRET</code>, and the{" "}
            <code>STRIPE_PRICE_*</code> env vars to enable self-serve plans.
          </p>
        </div>
      )}

      {/* Free trial — only while the workspace is on the trial clock. */}
      {onTrialClock && (
        <TrialStatus
          ended={entitlement.state === "expired"}
          daysLeft={entitlement.daysLeft ?? 0}
          trialEndsAt={entitlement.trialEndsAt}
          canManageBilling={canManageBilling}
          configured={configured}
        />
      )}

      {/* Current plan */}
      {hasActivePlan && sub && (
        <section aria-labelledby="plan">
          <SectionTitle eyebrow="Subscription" title="Current plan" />
          <div className="hairline bg-[var(--surface)] p-20 flex flex-col gap-20">
            <div className="flex items-start justify-between gap-16 flex-wrap">
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-10">
                  <h3
                    className="text-text"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 22,
                      fontWeight: 600,
                    }}
                  >
                    {TIER_LABEL[sub.tier] ?? sub.tier}
                  </h3>
                  <Badge
                    tone={
                      sub.status === "active"
                        ? "success"
                        : sub.status === "trialing"
                        ? "info"
                        : "warning"
                    }
                    variant="filled"
                  >
                    {sub.status}
                  </Badge>
                  {willCancel && (
                    <Badge tone="warning" variant="outline">
                      Cancels at period end
                    </Badge>
                  )}
                </div>
                <p className="mono-sm text-text-muted">
                  {seatUsage} member{seatUsage === 1 ? "" : "s"} · manage your
                  plan, payment method, and invoices in the billing portal.
                </p>
              </div>
              <form action={openBillingPortal}>
                <CornerButton type="submit" variant="primary" size="sm">
                  <ExternalLink size={11} strokeWidth={1.5} />
                  Manage billing
                </CornerButton>
              </form>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 hairline-t pt-20">
              <StatBlock
                icon={<Users size={11} strokeWidth={1.5} />}
                label="Members"
                primary={String(seatUsage)}
              />
              <StatBlock
                icon={<Calendar size={11} strokeWidth={1.5} />}
                label={willCancel ? "Access ends" : "Renews"}
                primary={
                  sub.current_period_end
                    ? new Date(sub.current_period_end).toLocaleDateString(
                        undefined,
                        { month: "short", day: "numeric", year: "numeric" }
                      )
                    : "—"
                }
              />
            </div>
          </div>
        </section>
      )}

      {/* Plan picker — when no active plan and Stripe is configured */}
      {!hasActivePlan && configured && planPrices.length > 0 && (
        <section aria-labelledby="plans">
          <SectionTitle eyebrow="Plans" title="Choose a plan" />
          <PlanGrid prices={planPrices} />
        </section>
      )}

      {/* Payment method */}
      {hasActivePlan && (
        <section aria-labelledby="payment">
          <SectionTitle
            eyebrow="Payment"
            title="Payment method"
            action={
              <form action={openBillingPortal}>
                <CornerButton type="submit" variant="ghost" size="sm">
                  <ExternalLink size={11} strokeWidth={1.5} />
                  Update
                </CornerButton>
              </form>
            }
          />
          <div className="hairline bg-[var(--surface)] px-20 py-16 flex items-center gap-14">
            <div
              className="w-40 h-28 hairline-subtle bg-[var(--surface-2)] flex items-center justify-center shrink-0"
              aria-hidden
            >
              <CreditCard size={14} strokeWidth={1.5} className="text-text-muted" />
            </div>
            {card ? (
              <div className="flex-1 min-w-0">
                <p
                  className="text-text"
                  style={{ fontFamily: "var(--mono)", fontSize: 13, fontWeight: 500 }}
                >
                  {card.brand.toUpperCase()} •••• {card.last4}
                </p>
                <p className="mono-sm text-text-muted">
                  expires{" "}
                  {String(card.expMonth).padStart(2, "0")}/{card.expYear}
                </p>
              </div>
            ) : (
              <p className="flex-1 mono-sm text-text-muted">
                No card on file — add one from the billing portal.
              </p>
            )}
          </div>
        </section>
      )}

      {/* Invoices */}
      {hasActivePlan && (
        <section aria-labelledby="invoices">
          <SectionTitle eyebrow="Receipts" title="Invoice history" />
          {invoices.length === 0 ? (
            <div className="hairline bg-[var(--surface-2)] px-20 py-16">
              <p className="mono-sm text-text-muted">
                No invoices yet — they&apos;ll appear here after your first
                billing cycle.
              </p>
            </div>
          ) : (
            <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
              {invoices.map((inv: InvoiceInfo) => (
                <li
                  key={inv.id}
                  className="px-20 py-14 flex items-center gap-14 row-interactive"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-text"
                      style={{ fontFamily: "var(--mono)", fontSize: 12, fontWeight: 500 }}
                    >
                      {inv.number ?? inv.id}
                    </p>
                    <p className="mono-sm text-text-muted">
                      {new Date(inv.created * 1000).toLocaleDateString(undefined, {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                  <span className="mono-body text-text tnum" style={{ fontSize: 13 }}>
                    {money(inv.total, inv.currency)}
                  </span>
                  <Badge
                    tone={inv.status === "paid" ? "success" : "warning"}
                    variant="outline"
                  >
                    {inv.status ?? "—"}
                  </Badge>
                  {inv.hostedUrl && (
                    <a
                      href={inv.hostedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hairline-subtle p-6 text-text-muted hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                      aria-label={`View invoice ${inv.number ?? inv.id}`}
                    >
                      <ExternalLink size={11} strokeWidth={1.5} />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function PlanGrid({ prices }: { prices: PlanPriceInfo[] }) {
  // Group by tier so each card can show its monthly + annual options.
  const tiers = Array.from(new Set(prices.map((p) => p.tier)));
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
      {tiers.map((tier) => {
        const tierPrices = prices.filter((p) => p.tier === tier);
        return (
          <div
            key={tier}
            className="hairline bg-[var(--surface)] p-20 flex flex-col gap-14"
          >
            <h3
              className="text-text"
              style={{ fontFamily: "var(--display)", fontSize: 18, fontWeight: 600 }}
            >
              {TIER_LABEL[tier] ?? tier}
            </h3>
            <div className="flex flex-col gap-8">
              {tierPrices.map((p) => (
                <form key={p.priceId} action={startCheckout}>
                  <input type="hidden" name="tier" value={p.tier} />
                  <input type="hidden" name="period" value={p.period} />
                  <CornerButton
                    type="submit"
                    variant={p.period === "annual" ? "primary" : "ghost"}
                    size="sm"
                    className="w-full justify-between"
                  >
                    <span>
                      {p.period === "annual" ? "Annual" : "Monthly"}
                      {p.amount != null && (
                        <>
                          {" — "}
                          {money(p.amount, p.currency)}
                          <span className="text-text-dim">
                            /{p.interval ?? (p.period === "annual" ? "yr" : "mo")}
                          </span>
                        </>
                      )}
                    </span>
                    <span aria-hidden>→</span>
                  </CornerButton>
                </form>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * The free-trial panel, shown only while the workspace is on the trial clock
 * (running or ended). State and day count come from lib/entitlement.ts; this
 * only puts them into words.
 */
function TrialStatus({
  ended,
  daysLeft,
  trialEndsAt,
  canManageBilling,
  configured,
}: {
  ended: boolean;
  daysLeft: number;
  trialEndsAt: string | null;
  canManageBilling: boolean;
  configured: boolean;
}) {
  const endsAt = trialEndsAt
    ? new Date(trialEndsAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "—";
  const nextStep = configured
    ? "choose a plan below"
    : "talk to us about a plan";

  const body = ended
    ? canManageBilling
      ? `The workspace is paused until it's on a plan — ${nextStep} and your team picks up exactly where they left off. Nothing has been changed or deleted.`
      : "The workspace is paused until an owner chooses a plan. Nothing has been changed or deleted."
    : canManageBilling
    ? `Full access for ${TRIAL_DAYS} days, no card required. To keep going without a break, ${nextStep} before it ends.`
    : `Full access for ${TRIAL_DAYS} days, no card required. A workspace owner can choose a plan here to keep it going.`;

  return (
    <section aria-labelledby="trial">
      <SectionTitle
        eyebrow="No card required"
        title="Free trial"
        action={
          canManageBilling ? (
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
          ) : undefined
        }
      />
      <div className="hairline bg-[var(--surface)] p-20 flex flex-col gap-20">
        <div className="flex flex-col gap-6">
          <div className="flex items-center gap-10 flex-wrap">
            <h3
              className="text-text"
              style={{
                fontFamily: "var(--display)",
                fontSize: 22,
                fontWeight: 600,
              }}
            >
              {ended ? "Your trial has ended" : formatDaysLeft(daysLeft)}
            </h3>
            <Badge
              tone={ended ? "danger" : daysLeft <= 2 ? "warning" : "info"}
              variant="filled"
            >
              {ended ? "Ended" : "Trial"}
            </Badge>
          </div>
          <p className="mono-sm text-text-muted">{body}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 hairline-t pt-20">
          <StatBlock
            icon={<Hourglass size={11} strokeWidth={1.5} />}
            label="Days left"
            primary={String(ended ? 0 : daysLeft)}
          />
          <StatBlock
            icon={<Calendar size={11} strokeWidth={1.5} />}
            label={ended ? "Ended" : "Ends"}
            primary={endsAt}
          />
        </div>
      </div>
    </section>
  );
}

function StatBlock({
  icon,
  label,
  primary,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-6 text-text-muted">
        {icon}
        <span className="label-text">{label}</span>
      </div>
      <p
        className="text-text"
        style={{
          fontFamily: "var(--mono)",
          fontSize: 17,
          fontWeight: 500,
          letterSpacing: "-0.3px",
        }}
      >
        {primary}
      </p>
    </div>
  );
}
