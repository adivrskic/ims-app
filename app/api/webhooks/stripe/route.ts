import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { planForPrice } from "@/lib/billing/plans";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook → keeps app.org_subscriptions in sync with Stripe.
 *
 * Verifies the signature with STRIPE_WEBHOOK_SECRET (raw body), then maps
 * subscription lifecycle events onto the org's subscription row. The org is
 * identified by metadata.org_id (set on checkout + subscription_data) or by
 * client_reference_id on the checkout session.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return new Response("Billing not configured", { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, sig, secret);
  } catch (err) {
    return new Response(
      `Signature verification failed: ${
        err instanceof Error ? err.message : "unknown"
      }`,
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId =
          (session.metadata?.org_id as string | undefined) ??
          session.client_reference_id ??
          null;
        const subId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id ?? null;
        if (orgId && subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await applySubscription(orgId, sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = (sub.metadata?.org_id as string | undefined) ?? null;
        if (orgId) await applySubscription(orgId, sub);
        break;
      }
      default:
        // Unhandled event types are acknowledged so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error("[stripe webhook] handler error:", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

/** Map a Stripe subscription onto the org's org_subscriptions row. */
async function applySubscription(
  orgId: string,
  sub: Stripe.Subscription
): Promise<void> {
  // Read version-tolerant fields loosely (period fields have shifted between
  // Stripe API versions between the subscription and its items).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = sub as any;
  const item = sub.items?.data?.[0];
  const priceId = item?.price?.id ?? null;
  const plan = priceId ? planForPrice(priceId) : null;

  const periodEnd: number | null =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    s.current_period_end ?? (item as any)?.current_period_end ?? null;
  const trialEnd: number | null = s.trial_end ?? null;

  const update: Record<string, unknown> = {
    stripe_customer_id:
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id ?? null,
    stripe_subscription_id: sub.id,
    status: sub.status,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
    trial_ends_at: trialEnd ? new Date(trialEnd * 1000).toISOString() : null,
    seats: item?.quantity ?? 1,
  };
  if (plan) update.tier = plan.tier;

  const admin = createAdminClient();

  // Upsert by org_id without assuming a unique constraint: update if present,
  // else insert.
  const { data: existing } = await admin
    .from("org_subscriptions")
    .select("id")
    .eq("org_id", orgId)
    .limit(1)
    .maybeSingle();

  if (existing) {
    await admin
      .from("org_subscriptions")
      .update(update)
      .eq("org_id", orgId);
  } else {
    await admin
      .from("org_subscriptions")
      .insert({ org_id: orgId, ...update });
  }
}
