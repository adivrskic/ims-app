import "server-only";
import Stripe from "stripe";

/**
 * Server-side Stripe client. Null when STRIPE_SECRET_KEY isn't set, so the
 * billing UI can degrade gracefully ("billing not configured") instead of
 * throwing. Use stripeConfigured() to branch.
 */
export const stripe: Stripe | null = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

export function stripeConfigured(): boolean {
  return Boolean(stripe);
}
