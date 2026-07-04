"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  encryptEndpointSecrets,
  generateWebhookSecret,
  testEndpoint,
  type WebhookEndpointRecord,
} from "@/lib/integrations/webhooks";
import { assertPublicHttpsUrl } from "@/lib/net/ssrf";

export interface CreateEndpointResult {
  error?: string;
  /** Plaintext secret — shown ONCE on creation, never returned again. */
  secret?: string;
  endpointId?: string;
}

/**
 * Create a new webhook endpoint. Generates a fresh HMAC secret, encrypts
 * the URL + secret, inserts the row. Returns the plaintext secret in the
 * action result so the UI can show it to the user once — after this
 * point we cannot recover it (it's only stored encrypted).
 */
export async function createWebhookEndpoint(
  _prev: CreateEndpointResult | undefined,
  formData: FormData
): Promise<CreateEndpointResult> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "Not signed in to a workspace" };
  if (!ctx.can("integrations.manage")) {
    return { error: "Only admins can create webhook endpoints" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const events = formData.getAll("events").map(String);

  if (!name) return { error: "Give the endpoint a name" };
  if (name.length > 80) return { error: "Name is too long (80 char max)" };
  if (!url) return { error: "Endpoint URL is required" };
  // SSRF guard: https-only + reject hosts that resolve to private/metadata IPs.
  try {
    await assertPublicHttpsUrl(url);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "That URL isn't valid" };
  }
  if (events.length === 0) {
    return { error: "Select at least one event to subscribe to" };
  }

  const secret = generateWebhookSecret();
  const { url_encrypted, secret_encrypted } = encryptEndpointSecrets(
    url,
    secret
  );

  const admin = createAdminClient();
  const { data: endpoint, error } = await admin
    .from("webhook_endpoints")
    .insert({
      org_id: ctx.orgId,
      name,
      url_encrypted,
      secret_encrypted,
      events_enabled: events,
      status: "active",
      created_by: ctx.user.id,
    })
    .select("id")
    .single();

  if (error || !endpoint) {
    return { error: `Couldn't create endpoint: ${error?.message}` };
  }

  revalidatePath("/integrations/webhooks");
  revalidatePath("/integrations");

  return { secret, endpointId: endpoint.id };
}

/** Update an existing endpoint's name + events. URL changes require deletion + recreation. */
export async function updateWebhookEndpoint(
  endpointId: string,
  formData: FormData
): Promise<{ error?: string; success?: string }> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "Not signed in" };
  if (!ctx.can("integrations.manage")) {
    return { error: "Only admins can edit endpoints" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const events = formData.getAll("events").map(String);

  if (!name) return { error: "Name is required" };
  if (events.length === 0) {
    return { error: "Select at least one event" };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("webhook_endpoints")
    .update({ name, events_enabled: events })
    .eq("id", endpointId)
    .eq("org_id", ctx.orgId);

  if (error) return { error: error.message };

  revalidatePath("/integrations/webhooks");
  return { success: "Endpoint updated" };
}

/** Toggle paused/active. */
export async function toggleWebhookEndpoint(endpointId: string): Promise<void> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return;
  if (!ctx.can("integrations.manage")) return;

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("webhook_endpoints")
    .select("status")
    .eq("id", endpointId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (!current) return;

  const nextStatus = current.status === "active" ? "paused" : "active";
  await admin
    .from("webhook_endpoints")
    .update({ status: nextStatus, last_error: null })
    .eq("id", endpointId);

  revalidatePath("/integrations/webhooks");
}

/** Delete an endpoint. Cascade-deletes its delivery log too. */
export async function deleteWebhookEndpoint(endpointId: string): Promise<void> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return;
  if (!ctx.can("integrations.manage")) return;

  const admin = createAdminClient();
  await admin
    .from("webhook_endpoints")
    .delete()
    .eq("id", endpointId)
    .eq("org_id", ctx.orgId);

  revalidatePath("/integrations/webhooks");
  revalidatePath("/integrations");
}

/** Fire a test event at an endpoint. */
export async function testWebhookEndpoint(
  endpointId: string
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in" };
  if (!ctx.can("integrations.manage")) {
    return { ok: false, error: "Only admins can test endpoints" };
  }

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("webhook_endpoints")
    .select(
      "id, org_id, name, url_encrypted, secret_encrypted, events_enabled, status"
    )
    .eq("id", endpointId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();

  if (!row) return { ok: false, error: "Endpoint not found" };

  const result = await testEndpoint(row as WebhookEndpointRecord);
  revalidatePath("/integrations/webhooks");
  return result;
}

/** For the delivery log expander on each row. Last 10 attempts. */
export async function getRecentDeliveries(endpointId: string) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return [];

  const admin = createAdminClient();
  const { data } = await admin
    .from("webhook_deliveries")
    .select(
      "id, event_type, event_id, response_status, succeeded, duration_ms, delivered_at, attempts, next_retry_at"
    )
    .eq("endpoint_id", endpointId)
    .eq("org_id", ctx.orgId)
    .order("delivered_at", { ascending: false })
    .limit(10);

  return data ?? [];
}
