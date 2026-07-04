import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAuthorizedCronRequest } from "@/lib/cronAuth";
import {
  MAX_WEBHOOK_ATTEMPTS,
  redeliverWebhook,
  type WebhookDeliveryRecord,
  type WebhookEndpointRecord,
} from "@/lib/integrations/webhooks";

/**
 * Scheduled webhook-retry sweep (webhook retry v2).
 *
 * Picks up webhook_deliveries rows whose retry is due (succeeded = false,
 * next_retry_at <= now, attempts < MAX) and re-delivers them via
 * redeliverWebhook: the ORIGINAL stored body verbatim under the ORIGINAL
 * X-Nautilus-Delivery id (the receiver's idempotency key) with a fresh
 * timestamp + signature. redeliverWebhook owns the row update — attempts+1,
 * refreshed response fields, and next_retry_at advanced along the
 * 15m → 1h → 4h → 12h backoff or nulled on success / exhaustion.
 *
 * A retry is DROPPED (next_retry_at nulled, no send) when it can no longer
 * be honored: the endpoint row is gone, the endpoint is no longer active
 * (paused/error — mirrors dispatchEvent's status filter), the event type
 * was unsubscribed, or the stored body is empty (SSRF/decrypt failures at
 * creation never had a payload to re-sign; they're never scheduled, this
 * is a backstop).
 *
 * SCHEDULE: pg_cron POSTs every 15 minutes (see the webhook_retries
 * migration). AUTH: CRON_SECRET bearer, constant-time compare. Admin client
 * (RLS bypassed), per repo convention for cron jobs — org scoping rides on
 * each delivery row's own endpoint_id.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 50;
const CONCURRENCY = 5;

type DueDelivery = WebhookDeliveryRecord & { next_retry_at: string };

export async function POST(req: Request) {
  if (!isAuthorizedCronRequest(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const summary = {
    due: 0,
    delivered: 0,
    rescheduled: 0,
    gaveUp: 0,
    dropped: 0,
  };

  const { data, error } = await admin
    .from("webhook_deliveries")
    .select(
      "id, endpoint_id, org_id, event_type, event_id, request_body, attempts, next_retry_at"
    )
    .eq("succeeded", false)
    .lte("next_retry_at", new Date().toISOString())
    .lt("attempts", MAX_WEBHOOK_ATTEMPTS)
    .order("next_retry_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const due = (data ?? []) as DueDelivery[];
  summary.due = due.length;
  if (due.length === 0) {
    return NextResponse.json({ ok: true, ...summary });
  }

  // One endpoint fetch for the whole batch (several deliveries often share
  // an endpoint). Deliveries cascade-delete with their endpoint, so a miss
  // here is a race with deletion — handled by the drop path below.
  const endpointIds = [...new Set(due.map((d) => d.endpoint_id))];
  const { data: endpointRows } = await admin
    .from("webhook_endpoints")
    .select(
      "id, org_id, name, url_encrypted, secret_encrypted, events_enabled, status"
    )
    .in("id", endpointIds);
  const endpoints = new Map(
    ((endpointRows ?? []) as WebhookEndpointRecord[]).map((e) => [e.id, e])
  );

  // Bounded concurrency, chunked like the stockout cron's narration fan-out.
  for (let i = 0; i < due.length; i += CONCURRENCY) {
    const chunk = due.slice(i, i + CONCURRENCY);
    await Promise.all(chunk.map((d) => retryOne(admin, d, endpoints, summary)));
  }

  return NextResponse.json({ ok: true, ...summary });
}

async function retryOne(
  admin: ReturnType<typeof createAdminClient>,
  delivery: DueDelivery,
  endpoints: Map<string, WebhookEndpointRecord>,
  summary: {
    delivered: number;
    rescheduled: number;
    gaveUp: number;
    dropped: number;
  }
): Promise<void> {
  const endpoint = endpoints.get(delivery.endpoint_id);
  const droppable =
    !delivery.request_body ||
    !endpoint ||
    endpoint.status !== "active" ||
    !endpoint.events_enabled.includes(delivery.event_type);

  if (droppable) {
    await admin
      .from("webhook_deliveries")
      .update({ next_retry_at: null })
      .eq("id", delivery.id);
    summary.dropped++;
    return;
  }

  try {
    const result = await redeliverWebhook(delivery, endpoint);
    if (result.ok) summary.delivered++;
    else if (result.gaveUp) summary.gaveUp++;
    else summary.rescheduled++;
  } catch (err) {
    // redeliverWebhook handles send errors internally; reaching here means
    // the row update itself failed. Leave the row untouched — its stale
    // next_retry_at keeps it eligible for the next sweep.
    console.error(`[webhook-retries] delivery ${delivery.id} failed:`, err);
  }
}
