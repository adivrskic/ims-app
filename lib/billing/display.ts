import "server-only";
import { stripe } from "@/lib/stripe";
import {
  allConfiguredPriceIds,
  type BillingPeriod,
  type PaidTier,
} from "@/lib/billing/plans";

export interface CardInfo {
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
}

export interface InvoiceInfo {
  id: string;
  number: string | null;
  created: number;
  total: number; // cents
  currency: string;
  status: string | null;
  hostedUrl: string | null;
  pdf: string | null;
}

export interface PlanPriceInfo {
  tier: PaidTier;
  period: BillingPeriod;
  priceId: string;
  amount: number | null; // cents
  currency: string;
  interval: string | null;
}

/** Default card on file for a customer, or null. Never throws. */
export async function getDefaultCard(
  customerId: string
): Promise<CardInfo | null> {
  if (!stripe) return null;
  try {
    const customer = await stripe.customers.retrieve(customerId, {
      expand: ["invoice_settings.default_payment_method"],
    });
    if (customer.deleted) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pm = (customer as any).invoice_settings
      ?.default_payment_method as { card?: Record<string, unknown> } | null;
    const card = pm?.card as
      | { brand?: string; last4?: string; exp_month?: number; exp_year?: number }
      | undefined;
    if (!card?.last4) return null;
    return {
      brand: card.brand ?? "card",
      last4: card.last4,
      expMonth: card.exp_month ?? 0,
      expYear: card.exp_year ?? 0,
    };
  } catch {
    return null;
  }
}

/** Recent invoices for a customer, newest first. Never throws. */
export async function getInvoices(customerId: string): Promise<InvoiceInfo[]> {
  if (!stripe) return [];
  try {
    const list = await stripe.invoices.list({ customer: customerId, limit: 6 });
    return list.data.map((inv) => ({
      id: inv.id ?? "",
      number: inv.number ?? null,
      created: inv.created,
      total: inv.total ?? 0,
      currency: inv.currency ?? "usd",
      status: inv.status ?? null,
      hostedUrl: inv.hosted_invoice_url ?? null,
      pdf: inv.invoice_pdf ?? null,
    }));
  } catch {
    return [];
  }
}

/** Display amounts for every configured plan price. Never throws. */
export async function getPlanPrices(): Promise<PlanPriceInfo[]> {
  if (!stripe) return [];
  const configured = allConfiguredPriceIds();
  const out = await Promise.all(
    configured.map(async ({ tier, period, priceId }) => {
      try {
        const price = await stripe!.prices.retrieve(priceId);
        return {
          tier,
          period,
          priceId,
          amount: price.unit_amount ?? null,
          currency: price.currency ?? "usd",
          interval: price.recurring?.interval ?? null,
        };
      } catch {
        return {
          tier,
          period,
          priceId,
          amount: null,
          currency: "usd",
          interval: null,
        };
      }
    })
  );
  return out;
}
