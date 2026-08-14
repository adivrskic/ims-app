"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getActionContext } from "@/lib/data/actionContext";
import { stripe } from "@/lib/stripe";
import { appUrl } from "@/lib/appUrl";
import { priceIdFor, type PaidTier, type BillingPeriod } from "@/lib/billing/plans";

/** Stripe success/cancel targets. Shared resolver — see lib/appUrl.ts. */
async function appOrigin(): Promise<string> {
  const h = await headers();
  return appUrl(h.get("origin"));
}

/** Read this org's stored Stripe customer id (if any). */
async function orgCustomerId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<string | null> {
  const { data } = await supabase
    .from("org_subscriptions")
    .select("stripe_customer_id")
    .limit(1)
    .maybeSingle();
  return (data as { stripe_customer_id: string | null } | null)
    ?.stripe_customer_id ?? null;
}

/**
 * Start a Stripe Checkout session for a paid plan. Creates (or reuses) the
 * org's Stripe customer; the webhook writes the resulting subscription back to
 * org_subscriptions. Gated on billing.manage.
 */
export async function startCheckout(formData: FormData): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("billing.manage")) return;
  if (!stripe) redirect("/settings/billing?error=billing_not_configured");

  const tier = String(formData.get("tier") ?? "") as PaidTier;
  const period = String(formData.get("period") ?? "") as BillingPeriod;
  const priceId = priceIdFor(tier, period);
  if (!priceId) redirect("/settings/billing?error=unknown_plan");

  const origin = await appOrigin();
  const existingCustomer = await orgCustomerId(ctx.supabase);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId as string, quantity: 1 }],
    client_reference_id: ctx.orgId,
    metadata: { org_id: ctx.orgId, tier, period },
    subscription_data: { metadata: { org_id: ctx.orgId, tier } },
    ...(existingCustomer
      ? { customer: existingCustomer }
      : { customer_email: ctx.user.email ?? undefined }),
    success_url: `${origin}/settings/billing?checkout=success`,
    cancel_url: `${origin}/settings/billing?checkout=cancelled`,
    allow_promotion_codes: true,
  });

  if (!session.url) redirect("/settings/billing?error=checkout_failed");
  redirect(session.url);
}

/**
 * Open the Stripe Billing Portal (update payment method, change/cancel plan,
 * download invoices). Requires an existing Stripe customer.
 */
export async function openBillingPortal(): Promise<void> {
  const ctx = await getActionContext();
  if ("error" in ctx) return;
  if (!ctx.can("billing.manage")) return;
  if (!stripe) redirect("/settings/billing?error=billing_not_configured");

  const customerId = await orgCustomerId(ctx.supabase);
  if (!customerId) redirect("/settings/billing?error=no_customer");

  const origin = await appOrigin();
  const portal = await stripe.billingPortal.sessions.create({
    customer: customerId as string,
    return_url: `${origin}/settings/billing`,
  });
  redirect(portal.url);
}
