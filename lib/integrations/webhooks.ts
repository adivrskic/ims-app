import "server-only";
import { createHmac, randomBytes } from "crypto";
import { request as httpsRequest } from "node:https";
import { decrypt, encrypt } from "./crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  resolvePublicHttpsAddress,
  type PublicHttpsTarget,
} from "@/lib/net/ssrf";
import type { EventPayload } from "./types";

/**
 * Outbound webhook adapter.
 *
 * The contract for receivers:
 *
 *   POST <user-provided URL>
 *   Content-Type: application/json
 *   User-Agent: Nautilus-Webhook/1.0
 *   X-Nautilus-Event: <event_type>          e.g. "low_stock"
 *   X-Nautilus-Delivery: <delivery_uuid>    idempotency key
 *   X-Nautilus-Timestamp: <unix_seconds>
 *   X-Nautilus-Signature: sha256=<hex>      HMAC-SHA256(secret, raw_body)
 *
 *   Body:
 *   {
 *     "id": "<delivery_uuid>",
 *     "type": "<event_type>",
 *     "created": <unix_seconds>,
 *     "data": { title, body, link, ... }
 *   }
 *
 * Receivers should:
 *   1. Re-compute the HMAC over the raw body using their stored secret
 *   2. Compare to the signature header in constant time
 *   3. Reject if the timestamp is too old (we recommend > 5 minutes)
 *   4. Use the X-Nautilus-Delivery header as an idempotency key
 *
 * Retries (v2): a failed delivery schedules its first retry 15 minutes out
 * by stamping next_retry_at on its webhook_deliveries row. A pg_cron job
 * POSTs /api/cron/webhook-retries every 15 minutes; the route picks up due
 * rows and calls redeliverWebhook, which re-sends the ORIGINAL stored body
 * verbatim under the ORIGINAL X-Nautilus-Delivery id (so receivers can
 * dedupe) with a FRESH timestamp + signature recomputed over that body
 * using the endpoint's current secret. Backoff after the Nth failed
 * attempt: 15m → 1h → 4h → 12h; we give up after 5 total attempts.
 * Deliveries that never produced an HTTP request (SSRF-blocked or decrypt
 * failures — logged with an empty body) are not retried, and retries stop
 * if the endpoint is deleted, no longer active, or unsubscribed from the
 * event type. See supabase/migrations/20260703180000_webhook_retries.sql.
 */

export interface WebhookEndpointRecord {
  id: string;
  org_id: string;
  name: string;
  url_encrypted: string;
  secret_encrypted: string;
  events_enabled: string[];
  status: "active" | "paused" | "error";
}

/** The slice of a webhook_deliveries row that redeliverWebhook needs. */
export interface WebhookDeliveryRecord {
  id: string;
  endpoint_id: string;
  org_id: string;
  event_type: string;
  /** The original delivery UUID — re-sent verbatim as X-Nautilus-Delivery. */
  event_id: string;
  /** The original signed payload — re-sent byte-for-byte on retry. */
  request_body: string;
  /** Attempts so far (the original send counts as 1). */
  attempts: number;
}

/** Total attempts (original + retries) before we give up on a delivery. */
export const MAX_WEBHOOK_ATTEMPTS = 5;

/** Backoff AFTER the Nth failed attempt: 1 → 15m, 2 → 1h, 3 → 4h, 4 → 12h. */
const RETRY_BACKOFF_MS = [
  15 * 60_000,
  60 * 60_000,
  4 * 60 * 60_000,
  12 * 60 * 60_000,
];

/**
 * When the next retry should run, given how many attempts have now failed.
 * Returns null once the budget is exhausted (attempts >= MAX_WEBHOOK_ATTEMPTS).
 */
function nextRetryAt(failedAttempts: number): string | null {
  if (failedAttempts >= MAX_WEBHOOK_ATTEMPTS) return null;
  const delay =
    RETRY_BACKOFF_MS[
      Math.min(failedAttempts, RETRY_BACKOFF_MS.length) - 1
    ];
  return new Date(Date.now() + delay).toISOString();
}

/** Generate a fresh 32-byte hex secret (64 chars). Call once at endpoint creation. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

/** Encrypt URL + secret for storage. */
export function encryptEndpointSecrets(
  url: string,
  secret: string
): {
  url_encrypted: string;
  secret_encrypted: string;
} {
  return {
    url_encrypted: encrypt(url),
    secret_encrypted: encrypt(secret),
  };
}

function signBody(secret: string, body: string): string {
  return "sha256=" + createHmac("sha256", secret).update(body).digest("hex");
}

/**
 * POST to a validated target with the socket pinned to the vetted address:
 * the custom `lookup` hands the connection the exact IP that passed the
 * public-address check, closing the DNS-rebinding TOCTOU between validation
 * and connect. `host`/`servername` stay on the hostname so SNI and
 * certificate validation are unaffected.
 */
function postPinned(
  target: PublicHttpsTarget,
  opts: { headers: Record<string, string>; body: string; timeoutMs: number }
): Promise<{ status: number; text: string }> {
  const { url, address, family } = target;
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: url.hostname,
        servername: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        method: "POST",
        headers: opts.headers,
        timeout: opts.timeoutMs,
        lookup: (_hostname, lookupOpts, cb) => {
          // Node may ask with { all: true } depending on internals.
          if (
            lookupOpts &&
            typeof lookupOpts === "object" &&
            "all" in lookupOpts &&
            lookupOpts.all
          ) {
            (cb as unknown as (e: null, a: unknown) => void)(null, [
              { address, family },
            ]);
          } else {
            cb(null, address, family);
          }
        },
      },
      (res) => {
        let text = "";
        res.on("data", (chunk: Buffer) => {
          // Truncate — some receivers stream entire HTML pages.
          if (text.length < 2000) text += chunk.toString("utf8");
        });
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, text: text.slice(0, 2000) })
        );
        res.on("error", reject);
      }
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.write(opts.body);
    req.end();
  });
}

/**
 * Deliver one event to one endpoint. Writes a row to webhook_deliveries
 * regardless of outcome, then updates the endpoint's counters + status.
 *
 * Network timeout: 10 seconds. Webhook receivers should respond fast
 * (queue the event on their end if they need to do real work).
 */
export async function deliverWebhook(
  endpoint: WebhookEndpointRecord,
  event: EventPayload
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const admin = createAdminClient();
  const deliveryId = crypto.randomUUID();
  const timestamp = Math.floor(Date.now() / 1000);

  // Decrypt credentials
  let url: string;
  let secret: string;
  try {
    url = decrypt(endpoint.url_encrypted);
    secret = decrypt(endpoint.secret_encrypted);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Decryption failed";
    await logDelivery(admin, {
      endpoint_id: endpoint.id,
      org_id: endpoint.org_id,
      event_type: event.type,
      event_id: deliveryId,
      body: "",
      status: null,
      response: `decrypt: ${message}`,
      duration: 0,
      succeeded: false,
    });
    return { ok: false, error: message };
  }

  // Re-validate the destination at delivery time — DNS can rebind between when
  // the endpoint was created and now (SSRF defense). The resolved address is
  // PINNED for the actual connection below, so the host can't return a public
  // IP to this check and a private one to the socket.
  let target: PublicHttpsTarget;
  try {
    target = await resolvePublicHttpsAddress(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Blocked destination";
    await logDelivery(admin, {
      endpoint_id: endpoint.id,
      org_id: endpoint.org_id,
      event_type: event.type,
      event_id: deliveryId,
      body: "",
      status: null,
      response: `blocked: ${message}`,
      duration: 0,
      succeeded: false,
    });
    return { ok: false, error: message };
  }

  // Build the payload
  const body = JSON.stringify({
    id: deliveryId,
    type: event.type,
    created: timestamp,
    data: {
      title: event.title,
      body: event.body,
      link: event.link ?? null,
      ...(event.data ?? {}),
    },
  });

  const signature = signBody(secret, body);

  // POST via node:https with the connection pinned to the vetted address
  // (custom `lookup`), while TLS SNI + certificate validation still run
  // against the hostname. Redirects are never followed — node:https doesn't
  // follow them, so a 3xx is just a failed status (same effect as the old
  // fetch redirect:"error", with better logging).
  const startedAt = Date.now();

  let status: number | null = null;
  let responseBody = "";
  let succeeded = false;
  let error: string | undefined;

  try {
    const res = await postPinned(target, {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
        "User-Agent": "Nautilus-Webhook/1.0",
        "X-Nautilus-Event": event.type,
        "X-Nautilus-Delivery": deliveryId,
        "X-Nautilus-Timestamp": String(timestamp),
        "X-Nautilus-Signature": signature,
      },
      body,
      timeoutMs: 10_000,
    });
    status = res.status;
    responseBody = res.text;
    succeeded = status >= 200 && status < 300;
    if (!succeeded) {
      error = `HTTP ${status}: ${responseBody.slice(0, 200)}`;
    }
  } catch (err) {
    error =
      err instanceof Error && err.message === "timeout"
        ? "Timed out after 10s"
        : err instanceof Error
          ? err.message
          : "Network error";
  }

  const duration = Date.now() - startedAt;

  // Log + schedule the first retry on failure. Only genuine send failures
  // are retried — the decrypt/SSRF failures above never set next_retry_at
  // (their empty body can't be re-signed, and the condition won't heal).
  await logDelivery(admin, {
    endpoint_id: endpoint.id,
    org_id: endpoint.org_id,
    event_type: event.type,
    event_id: deliveryId,
    body,
    status,
    response: responseBody || error || "",
    duration,
    succeeded,
    next_retry_at: succeeded ? null : nextRetryAt(1),
  });

  if (succeeded) {
    await recordEndpointSuccess(admin, endpoint.id);
  } else {
    await recordEndpointFailure(admin, endpoint.id, error ?? `HTTP ${status}`);
  }

  return { ok: succeeded, status: status ?? undefined, error };
}

/**
 * Re-attempt a previously failed delivery (called by the webhook-retries
 * cron). Sends the ORIGINAL request_body verbatim with the ORIGINAL
 * X-Nautilus-Delivery id — receivers treat that header as their idempotency
 * key — but a FRESH timestamp + signature (recomputed over the stored body
 * with the endpoint's current secret), so receivers' replay-window checks
 * still pass. Updates the SAME webhook_deliveries row in place: attempts+1,
 * refreshed status/response/duration, and either next_retry_at = null
 * (success, or budget exhausted) or the next backoff slot.
 */
export async function redeliverWebhook(
  delivery: WebhookDeliveryRecord,
  endpoint: WebhookEndpointRecord
): Promise<{ ok: boolean; status?: number; error?: string; gaveUp: boolean }> {
  const admin = createAdminClient();
  const attempts = delivery.attempts + 1;
  const body = delivery.request_body;
  const timestamp = Math.floor(Date.now() / 1000);
  const startedAt = Date.now();

  let status: number | null = null;
  let responseBody = "";
  let succeeded = false;
  let error: string | undefined;

  try {
    const url = decrypt(endpoint.url_encrypted);
    const secret = decrypt(endpoint.secret_encrypted);
    // Same SSRF defense as the original send: re-resolve at delivery time
    // and pin the socket to the vetted address.
    const target = await resolvePublicHttpsAddress(url);
    const res = await postPinned(target, {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
        "User-Agent": "Nautilus-Webhook/1.0",
        "X-Nautilus-Event": delivery.event_type,
        "X-Nautilus-Delivery": delivery.event_id,
        "X-Nautilus-Timestamp": String(timestamp),
        "X-Nautilus-Signature": signBody(secret, body),
      },
      body,
      timeoutMs: 10_000,
    });
    status = res.status;
    responseBody = res.text;
    succeeded = status >= 200 && status < 300;
    if (!succeeded) {
      error = `HTTP ${status}: ${responseBody.slice(0, 200)}`;
    }
  } catch (err) {
    error =
      err instanceof Error && err.message === "timeout"
        ? "Timed out after 10s"
        : err instanceof Error
          ? err.message
          : "Network error";
  }

  const duration = Date.now() - startedAt;
  const nextRetry = succeeded ? null : nextRetryAt(attempts);

  await admin
    .from("webhook_deliveries")
    .update({
      attempts,
      retried_at: new Date().toISOString(),
      response_status: status,
      response_body: (responseBody || error || "").slice(0, 4000),
      duration_ms: duration,
      succeeded,
      next_retry_at: nextRetry,
    })
    .eq("id", delivery.id);

  // Same counter/last_error mechanism as the original send — a late success
  // clears last_error; a final failure leaves it explaining why.
  if (succeeded) {
    await recordEndpointSuccess(admin, endpoint.id);
  } else {
    await recordEndpointFailure(admin, endpoint.id, error ?? `HTTP ${status}`);
  }

  return {
    ok: succeeded,
    status: status ?? undefined,
    error,
    gaveUp: !succeeded && nextRetry === null,
  };
}

/**
 * Atomic-ish counter updates (good enough — high-throughput workspaces
 * would race here, but the absolute numbers don't need to be perfect for
 * a debug counter).
 */
async function recordEndpointSuccess(
  admin: ReturnType<typeof createAdminClient>,
  endpointId: string
): Promise<void> {
  await admin
    .rpc("increment_webhook_success", {
      endpoint_id: endpointId,
      delivered_at: new Date().toISOString(),
    })
    .then(
      (r) => r,
      // If the RPC doesn't exist yet, fall back to a manual update
      async () => {
        await admin
          .from("webhook_endpoints")
          .update({
            last_delivered_at: new Date().toISOString(),
            last_error: null,
            total_deliveries:
              ((
                await admin
                  .from("webhook_endpoints")
                  .select("total_deliveries")
                  .eq("id", endpointId)
                  .single()
              ).data?.total_deliveries ?? 0) + 1,
          })
          .eq("id", endpointId);
      }
    );
}

async function recordEndpointFailure(
  admin: ReturnType<typeof createAdminClient>,
  endpointId: string,
  lastError: string
): Promise<void> {
  await admin
    .from("webhook_endpoints")
    .update({
      last_error: lastError,
      total_failures:
        ((
          await admin
            .from("webhook_endpoints")
            .select("total_failures")
            .eq("id", endpointId)
            .single()
        ).data?.total_failures ?? 0) + 1,
    })
    .eq("id", endpointId);
}

async function logDelivery(
  admin: ReturnType<typeof createAdminClient>,
  d: {
    endpoint_id: string;
    org_id: string;
    event_type: string;
    event_id: string;
    body: string;
    status: number | null;
    response: string;
    duration: number;
    succeeded: boolean;
    /** When the retry cron should re-attempt this delivery (failures only). */
    next_retry_at?: string | null;
  }
): Promise<void> {
  const { data: row } = await admin
    .from("webhook_deliveries")
    .insert({
      endpoint_id: d.endpoint_id,
      org_id: d.org_id,
      event_type: d.event_type,
      event_id: d.event_id,
      request_body: d.body,
      response_status: d.status,
      response_body: d.response.slice(0, 4000),
      duration_ms: d.duration,
      succeeded: d.succeeded,
    })
    .select("id")
    .maybeSingle();

  // Retry scheduling is a best-effort follow-up UPDATE rather than part of
  // the insert, so the delivery log itself can never be lost to a missing
  // next_retry_at column (code deployed before the retry migration) — the
  // delivery just behaves like v1 (no retry) in that window.
  if (d.next_retry_at && row?.id) {
    await admin
      .from("webhook_deliveries")
      .update({ next_retry_at: d.next_retry_at })
      .eq("id", row.id)
      .then(
        (r) => r,
        () => undefined
      );
  }
}

/** Fire a test event to an endpoint. Useful from the UI's Test button. */
export async function testEndpoint(
  endpoint: WebhookEndpointRecord
): Promise<{ ok: boolean; status?: number; error?: string }> {
  return deliverWebhook(endpoint, {
    type: "low_stock",
    org_id: endpoint.org_id,
    title: "Test event from Nautilus",
    body: "If your endpoint received this with a valid signature, you're wired up correctly.",
    link: "https://app.nautilus.io/integrations/webhooks",
    occurred_at: new Date().toISOString(),
    data: { test: true },
  });
}
