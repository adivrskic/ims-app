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
 * v1 has no retry — failures are logged in webhook_deliveries and the
 * endpoint's last_error is set, but we don't re-attempt. Customers can
 * manually re-test from the UI. v2: queue + exponential backoff.
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

  // Log + update counters
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
  });

  // Atomic-ish counter update (good enough for v1 — high-throughput
  // workspaces would race here, but the absolute numbers don't need to
  // be perfect for a debug counter).
  if (succeeded) {
    await admin
      .rpc("increment_webhook_success", {
        endpoint_id: endpoint.id,
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
                    .eq("id", endpoint.id)
                    .single()
                ).data?.total_deliveries ?? 0) + 1,
            })
            .eq("id", endpoint.id);
        }
      );
  } else {
    await admin
      .from("webhook_endpoints")
      .update({
        last_error: error ?? `HTTP ${status}`,
        total_failures:
          ((
            await admin
              .from("webhook_endpoints")
              .select("total_failures")
              .eq("id", endpoint.id)
              .single()
          ).data?.total_failures ?? 0) + 1,
      })
      .eq("id", endpoint.id);
  }

  return { ok: succeeded, status: status ?? undefined, error };
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
  }
): Promise<void> {
  await admin.from("webhook_deliveries").insert({
    endpoint_id: d.endpoint_id,
    org_id: d.org_id,
    event_type: d.event_type,
    event_id: d.event_id,
    request_body: d.body,
    response_status: d.status,
    response_body: d.response.slice(0, 4000),
    duration_ms: d.duration,
    succeeded: d.succeeded,
  });
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
