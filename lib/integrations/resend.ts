import "server-only";
import { decrypt } from "./crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  inviteEmail,
  testEmail,
  eventEmail,
  type InviteEmailInput,
  type EventEmailInput,
} from "@/lib/email/templates";
import type { EventPayload, IntegrationRecord } from "./types";

/**
 * Resend transactional email adapter.
 *
 * Auth: simple bearer-token API keys, no OAuth. Users generate keys in
 * the Resend dashboard, paste them here, we encrypt + store.
 *
 * Sending model: HTTP POST to api.resend.com/emails. Single message per
 * call. No batching in v1 — each event-driven email fires its own call.
 *
 * Sender identity: Resend requires the "from" domain to be verified.
 * We don't validate that here; if the user enters an unverified domain
 * Resend will reject the send with 422 and the error surfaces in the UI.
 *
 * Rate limits: Resend's free tier is 100 emails/day, paid starts at
 * 50/sec. We don't currently cap or retry — failures get logged via
 * the dispatch path's standard `last_error` mechanism.
 */

interface ResendConfig {
  from_address?: string; // e.g. "Nautilus <noreply@yourdomain.com>"
  from_name?: string; // optional override
  reply_to?: string;
}

interface ResendSendInput {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

interface ResendApiResponse {
  id?: string;
  message?: string;
  name?: string;
  statusCode?: number;
}

/**
 * Low-level Resend send. Returns { ok, id, error } so callers can
 * decide how to surface failures.
 */
async function resendSend(
  apiKey: string,
  config: ResendConfig,
  input: ResendSendInput
): Promise<{ ok: boolean; id?: string; status?: number; error?: string }> {
  const fromAddress = config.from_address;
  if (!fromAddress) {
    return { ok: false, error: "No from-address configured" };
  }

  const body: Record<string, unknown> = {
    from: fromAddress,
    to: Array.isArray(input.to) ? input.to : [input.to],
    subject: input.subject,
    html: input.html,
    text: input.text,
  };
  if (config.reply_to) body.reply_to = config.reply_to;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as ResendApiResponse;

    if (res.ok && data.id) {
      return { ok: true, id: data.id, status: res.status };
    }
    return {
      ok: false,
      status: res.status,
      error: data.message || data.name || `Resend returned ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Get the decrypted API key + config from an integration row. */
function unpack(
  integration: IntegrationRecord
): { apiKey: string; config: ResendConfig } | { error: string } {
  if (!integration.credentials_encrypted) {
    return { error: "No API key configured" };
  }
  let apiKey: string;
  try {
    apiKey = decrypt(integration.credentials_encrypted);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Couldn't decrypt API key: ${err.message}`
          : "Decryption failed",
    };
  }
  return { apiKey, config: (integration.config ?? {}) as ResendConfig };
}

// ─── Public send functions ─────────────────────────────────────────

/**
 * Send a team-invite email. Caller is the inviteMember / setUpWorkspace
 * action; passes the invite + workspace + inviter context.
 */
export async function sendInviteViaResend(
  integration: IntegrationRecord,
  input: InviteEmailInput
): Promise<{ ok: boolean; error?: string }> {
  const unpacked = unpack(integration);
  if ("error" in unpacked) return { ok: false, error: unpacked.error };

  const { subject, html, text } = inviteEmail(input);
  const result = await resendSend(unpacked.apiKey, unpacked.config, {
    to: input.recipientEmail,
    subject,
    html,
    text,
  });
  return { ok: result.ok, error: result.error };
}

/**
 * Test send — goes to a specific address (usually the connecting user's
 * own email) with a fixed "you're connected" template.
 */
export async function testResendIntegration(
  integration: IntegrationRecord,
  recipientEmail: string,
  orgName: string
): Promise<{ ok: boolean; error?: string }> {
  const unpacked = unpack(integration);
  if ("error" in unpacked) return { ok: false, error: unpacked.error };

  const { subject, html, text } = testEmail({
    recipientEmail,
    orgName,
    fromAddress: unpacked.config.from_address ?? "(unconfigured)",
  });
  const result = await resendSend(unpacked.apiKey, unpacked.config, {
    to: recipientEmail,
    subject,
    html,
    text,
  });
  return { ok: result.ok, error: result.error };
}

/**
 * Send an event email to all org admins. Called by dispatch when an
 * event matches this integration's events_enabled.
 */
export async function sendEventViaResend(
  integration: IntegrationRecord,
  event: EventPayload
): Promise<{ ok: boolean; error?: string }> {
  const unpacked = unpack(integration);
  if ("error" in unpacked) return { ok: false, error: unpacked.error };

  // Resolve admin recipients. We use the admin client because the
  // integration row already verified the caller's org membership; we're
  // just looking up who else in the org should be notified.
  const admin = createAdminClient();
  const { data: members } = await admin
    .from("org_members")
    .select("user_id, role, profile:profiles ( email )")
    .eq("org_id", integration.org_id)
    .in("role", ["owner", "admin"]);

  if (!members || members.length === 0) {
    return { ok: false, error: "No admin recipients in workspace" };
  }

  // Look up the org name once for the email subject.
  const { data: orgRow } = await admin
    .from("orgs")
    .select("name")
    .eq("id", integration.org_id)
    .maybeSingle();
  const orgName = orgRow?.name ?? "your workspace";

  // Send to each admin separately so Resend's audit log shows individual
  // deliveries (and so one bad address doesn't 422 the whole batch).
  const recipients: string[] = [];
  for (const m of members) {
    const profile = Array.isArray(m.profile) ? m.profile[0] : m.profile;
    const email = (profile as { email?: string } | null)?.email;
    if (email) recipients.push(email);
  }

  if (recipients.length === 0) {
    return { ok: false, error: "No admins with email addresses" };
  }

  const results = await Promise.all(
    recipients.map((to) => {
      const { subject, html, text } = eventEmail({
        eventTitle: event.title,
        eventBody: event.body,
        eventLink: event.link,
        eventType: event.type,
        orgName,
        recipientEmail: to,
      });
      return resendSend(unpacked.apiKey, unpacked.config, {
        to,
        subject,
        html,
        text,
      });
    })
  );

  const failures = results.filter((r) => !r.ok);
  if (failures.length === results.length) {
    return {
      ok: false,
      error: `All sends failed: ${failures[0]?.error ?? "unknown"}`,
    };
  }
  if (failures.length > 0) {
    return {
      ok: true, // partial success — counts as ok, but log the failures
      error: `${failures.length}/${results.length} sends failed: ${failures[0]?.error}`,
    };
  }
  return { ok: true };
}

/**
 * Find the connected Resend integration for an org, if any. Convenience
 * for callers like inviteMember that want to optionally send an email
 * via Resend without knowing whether it's set up.
 */
export async function findResendIntegration(
  orgId: string
): Promise<IntegrationRecord | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("integrations")
    .select(
      "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
    )
    .eq("org_id", orgId)
    .eq("provider", "resend")
    .eq("status", "connected")
    .maybeSingle();
  return (data as IntegrationRecord | null) ?? null;
}
