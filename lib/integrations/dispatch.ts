import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSlackEvent } from "./slack";
import { sendEventViaResend } from "./resend";
import { deliverWebhook, type WebhookEndpointRecord } from "./webhooks";
import type {
  EventPayload,
  IntegrationEvent,
  IntegrationRecord,
} from "./types";

/**
 * Fan an event out to every connected integration AND every active
 * webhook endpoint in the given org that's subscribed to this event type.
 *
 * Both queries fire in parallel; dispatches are then done in parallel too.
 * Failures inside one delivery don't block others or block the caller.
 */
export async function dispatchEvent(event: EventPayload): Promise<void> {
  const admin = createAdminClient();

  const [integrationsResult, endpointsResult] = await Promise.all([
    admin
      .from("integrations")
      .select(
        "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
      )
      .eq("org_id", event.org_id)
      .eq("status", "connected")
      .contains("events_enabled", [event.type]),
    admin
      .from("webhook_endpoints")
      .select(
        "id, org_id, name, url_encrypted, secret_encrypted, events_enabled, status"
      )
      .eq("org_id", event.org_id)
      .eq("status", "active")
      .contains("events_enabled", [event.type]),
  ]);

  const integrations = (integrationsResult.data ?? []) as IntegrationRecord[];
  const endpoints = (endpointsResult.data ?? []) as WebhookEndpointRecord[];

  if (integrationsResult.error) {
    console.error(
      "[dispatch] integrations lookup failed:",
      integrationsResult.error
    );
  }
  if (endpointsResult.error) {
    console.error("[dispatch] endpoints lookup failed:", endpointsResult.error);
  }

  await Promise.all([
    ...integrations.map((row) => dispatchIntegration(row, event)),
    ...endpoints.map((row) => dispatchWebhook(row, event)),
  ]);
}

async function dispatchIntegration(
  integration: IntegrationRecord,
  event: EventPayload
): Promise<void> {
  let result: { ok: boolean; error?: string };

  try {
    switch (integration.provider) {
      case "slack":
        result = await sendSlackEvent(integration, event);
        break;
      case "resend":
        result = await sendEventViaResend(integration, event);
        break;
      default:
        result = {
          ok: false,
          error: `Unknown provider: ${integration.provider}`,
        };
    }
  } catch (err) {
    result = {
      ok: false,
      error: err instanceof Error ? err.message : "Adapter threw",
    };
  }

  const admin = createAdminClient();
  if (result.ok) {
    await admin
      .from("integrations")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", integration.id);
  } else {
    console.error(
      `[dispatch] ${integration.provider} failed for org ${integration.org_id}:`,
      result.error
    );
    await admin
      .from("integrations")
      .update({ last_error: result.error ?? "Unknown error" })
      .eq("id", integration.id);
  }
}

async function dispatchWebhook(
  endpoint: WebhookEndpointRecord,
  event: EventPayload
): Promise<void> {
  // deliverWebhook handles its own logging + counter updates
  try {
    await deliverWebhook(endpoint, event);
  } catch (err) {
    console.error(`[dispatch] webhook ${endpoint.id} threw unexpectedly:`, err);
  }
}

export function isValidEvent(t: string): t is IntegrationEvent {
  return [
    "low_stock",
    "scan_burst",
    "po_received",
    "cycle_count_variance",
    "daily_summary",
  ].includes(t);
}
