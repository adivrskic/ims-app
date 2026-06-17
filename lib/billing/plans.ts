import "server-only";

/**
 * Plan → Stripe Price mapping, driven entirely by env so the same code works
 * across test/live without edits. Set the price ids for whichever tiers/periods
 * you offer; unset ones simply don't render a checkout button.
 *
 *   STRIPE_PRICE_PRO_MONTHLY
 *   STRIPE_PRICE_PRO_ANNUAL
 *   STRIPE_PRICE_ENTERPRISE_MONTHLY
 *   STRIPE_PRICE_ENTERPRISE_ANNUAL
 */

export type PaidTier = "pro" | "enterprise";
export type BillingPeriod = "monthly" | "annual";

export const TIER_LABEL: Record<PaidTier, string> = {
  pro: "Pro",
  enterprise: "Enterprise",
};

function env(key: string): string {
  return (process.env[key] ?? "").trim();
}

const PRICE_ENV: Record<PaidTier, Record<BillingPeriod, string>> = {
  pro: {
    monthly: "STRIPE_PRICE_PRO_MONTHLY",
    annual: "STRIPE_PRICE_PRO_ANNUAL",
  },
  enterprise: {
    monthly: "STRIPE_PRICE_ENTERPRISE_MONTHLY",
    annual: "STRIPE_PRICE_ENTERPRISE_ANNUAL",
  },
};

/** The configured Stripe price id for a tier+period, or null if not set. */
export function priceIdFor(
  tier: PaidTier,
  period: BillingPeriod
): string | null {
  return env(PRICE_ENV[tier][period]) || null;
}

/** Resolve a Stripe price id back to (tier, period), or null if unknown. */
export function planForPrice(
  priceId: string
): { tier: PaidTier; period: BillingPeriod } | null {
  for (const tier of Object.keys(PRICE_ENV) as PaidTier[]) {
    for (const period of ["monthly", "annual"] as BillingPeriod[]) {
      if (priceIdFor(tier, period) === priceId) return { tier, period };
    }
  }
  return null;
}

/** All configured price ids — handy for fetching display amounts. */
export function allConfiguredPriceIds(): Array<{
  tier: PaidTier;
  period: BillingPeriod;
  priceId: string;
}> {
  const out: Array<{ tier: PaidTier; period: BillingPeriod; priceId: string }> =
    [];
  for (const tier of Object.keys(PRICE_ENV) as PaidTier[]) {
    for (const period of ["monthly", "annual"] as BillingPeriod[]) {
      const priceId = priceIdFor(tier, period);
      if (priceId) out.push({ tier, period, priceId });
    }
  }
  return out;
}
