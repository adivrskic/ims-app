import { createClient } from "@/lib/supabase/server";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { Badge } from "@/components/ui/Badge";
import { CornerButton } from "@/components/ui/CornerButton";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  CreditCard,
  ExternalLink,
  Receipt,
  Users,
  Calendar,
  ArrowUpRight,
  AlertTriangle,
} from "lucide-react";

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

const TIER_PRICE = {
  pro: { monthly: 49, label: "Pro" },
  enterprise: { monthly: 199, label: "Enterprise" },
};

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function daysUntil(iso: string | null): { days: number; label: string } {
  if (!iso) return { days: 0, label: "—" };
  const ms = new Date(iso).getTime() - Date.now();
  const days = Math.ceil(ms / 86400000);
  if (days <= 0) return { days, label: "Today" };
  if (days === 1) return { days, label: "Tomorrow" };
  return { days, label: `In ${days} days` };
}

export default async function BillingPage() {
  const supabase = await createClient();

  const [{ data: subRaw }, { count: memberCount }] = await Promise.all([
    supabase
      .from("org_subscriptions")
      .select(
        "tier, seats, status, trial_ends_at, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id"
      )
      .limit(1)
      .maybeSingle(),
    supabase
      .from("org_members")
      .select("user_id", { count: "exact", head: true }),
  ]);

  const sub = subRaw as SubscriptionRow | null;

  if (!sub) {
    return (
      <EmptyState
        title="No active subscription"
        description="Start a Pro trial to unlock unlimited products, real-time analytics, and full integration access. 14 days free, no credit card required."
        icon={<CreditCard size={20} strokeWidth={1.5} />}
        action={
          <CornerButton variant="primary" size="sm" disabled>
            Start Pro trial
          </CornerButton>
        }
      />
    );
  }

  const tier = TIER_PRICE[sub.tier];
  const seatUsage = memberCount ?? 0;
  const seatPct = sub.seats > 0 ? Math.round((seatUsage / sub.seats) * 100) : 0;
  const renewal = daysUntil(sub.current_period_end);
  const nextCharge = tier.monthly * 100; // cents
  const isActive = sub.status === "active";
  const isTrialing = sub.status === "trialing";
  const willCancel = !!sub.cancel_at_period_end;

  return (
    <div className="flex flex-col gap-40">
      {willCancel && (
        <div className="hairline border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-16 py-12 flex items-center gap-12">
          <AlertTriangle
            size={14}
            strokeWidth={1.5}
            className="text-[var(--danger)] shrink-0"
          />
          <div className="flex-1">
            <p
              className="text-[var(--danger)]"
              style={{
                fontFamily: "var(--display)",
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Subscription scheduled to cancel
            </p>
            <p className="mono-sm text-text-secondary mt-2">
              Access ends{" "}
              {sub.current_period_end
                ? new Date(sub.current_period_end).toLocaleDateString()
                : "soon"}
              . Resume any time before then.
            </p>
          </div>
          <CornerButton variant="primary" size="sm" disabled>
            Resume
          </CornerButton>
        </div>
      )}

      {/* Plan summary */}
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
                  Nautilus {tier.label}
                </h3>
                <Badge
                  tone={isActive ? "success" : isTrialing ? "info" : "warning"}
                  variant="filled"
                >
                  {sub.status}
                </Badge>
              </div>
              <p className="mono-sm text-text-muted">
                ${tier.monthly}/seat · billed monthly
              </p>
            </div>
            <div className="flex items-center gap-10 flex-wrap">
              <CornerButton variant="ghost" size="sm" disabled>
                Change plan
              </CornerButton>
              {!willCancel && (
                <CornerButton variant="ghost" size="sm" disabled>
                  Cancel
                </CornerButton>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 hairline-t pt-20">
            <StatBlock
              icon={<Users size={11} strokeWidth={1.5} />}
              label="Seats"
              primary={`${seatUsage} of ${sub.seats}`}
              secondary={`${seatPct}% used`}
            />
            <StatBlock
              icon={<Calendar size={11} strokeWidth={1.5} />}
              label="Next renewal"
              primary={
                sub.current_period_end
                  ? new Date(sub.current_period_end).toLocaleDateString(
                      undefined,
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      }
                    )
                  : "—"
              }
              secondary={renewal.label}
            />
            <StatBlock
              icon={<Receipt size={11} strokeWidth={1.5} />}
              label="Next charge"
              primary={formatCurrency(nextCharge * sub.seats)}
              secondary={`${sub.seats} × ${formatCurrency(nextCharge)}`}
            />
          </div>
        </div>
      </section>

      {/* Payment method */}
      <section aria-labelledby="payment">
        <SectionTitle
          eyebrow="Payment"
          title="Payment method"
          action={
            <CornerButton variant="ghost" size="sm" disabled>
              <ExternalLink size={11} strokeWidth={1.5} />
              Manage in Stripe
            </CornerButton>
          }
        />
        <div className="hairline bg-[var(--surface)] px-20 py-16 flex items-center gap-14">
          <div
            className="w-40 h-28 hairline-subtle bg-[var(--surface-2)] flex items-center justify-center shrink-0"
            aria-hidden
          >
            <CreditCard
              size={14}
              strokeWidth={1.5}
              className="text-text-muted"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-text"
              style={{
                fontFamily: "var(--mono)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              •••• •••• •••• 4242
            </p>
            <p className="mono-sm text-text-muted">Visa · expires 12/2028</p>
          </div>
          <Badge tone="success" variant="outline">
            Default
          </Badge>
        </div>
      </section>

      {/* Invoices */}
      <section aria-labelledby="invoices">
        <SectionTitle
          eyebrow="Receipts"
          title="Invoice history"
          action={
            <CornerButton variant="ghost" size="sm" disabled>
              <ExternalLink size={11} strokeWidth={1.5} />
              View in Stripe
            </CornerButton>
          }
        />
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {[0, 1, 2, 3].map((monthsAgo) => {
            const d = new Date();
            d.setMonth(d.getMonth() - monthsAgo);
            d.setDate(15);
            const amount = formatCurrency(nextCharge * sub.seats);
            const isCurrent = monthsAgo === 0;
            return (
              <li
                key={monthsAgo}
                className="px-20 py-14 flex items-center gap-14 row-interactive"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-text"
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    INV-{2025000 + (4 - monthsAgo)}
                  </p>
                  <p className="mono-sm text-text-muted">
                    {d.toLocaleDateString(undefined, {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    · Nautilus {tier.label} ({sub.seats} seats)
                  </p>
                </div>
                <span
                  className="mono-body text-text tnum"
                  style={{ fontSize: 13 }}
                >
                  {amount}
                </span>
                <Badge
                  tone={isCurrent ? "warning" : "success"}
                  variant="outline"
                >
                  {isCurrent ? "Upcoming" : "Paid"}
                </Badge>
                <button
                  type="button"
                  disabled
                  className="hairline-subtle p-6 text-text-dim opacity-50 cursor-not-allowed"
                  aria-label={`Download invoice INV-${
                    2025000 + (4 - monthsAgo)
                  }`}
                >
                  <ArrowUpRight size={11} strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
        <p className="mono-sm text-text-dim mt-12 px-4">
          Older invoices are available in your Stripe billing portal.
        </p>
      </section>
    </div>
  );
}

function StatBlock({
  icon,
  label,
  primary,
  secondary,
}: {
  icon: React.ReactNode;
  label: string;
  primary: string;
  secondary: string;
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
      <p className="mono-sm text-text-dim">{secondary}</p>
    </div>
  );
}
