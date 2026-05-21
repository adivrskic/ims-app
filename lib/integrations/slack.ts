import "server-only";
import { decrypt } from "./crypto";
import type { EventPayload, IntegrationRecord } from "./types";

/**
 * Slack incoming-webhook adapter.
 *
 * Slack's incoming webhooks are the simplest possible integration:
 *   - User generates a webhook URL in their Slack app settings (one-time)
 *   - We POST JSON to that URL; Slack posts the message in the chosen channel
 *   - No OAuth, no token refresh, no signature verification (the URL itself
 *     is the auth factor — anyone with the URL can post)
 *
 * For richer multi-channel + DM-able workflows we'd switch to a proper
 * Slack OAuth app. The simple webhook is the right v1.
 */

interface SlackBlock {
  type: "section" | "context" | "divider";
  text?: { type: "mrkdwn" | "plain_text"; text: string };
  elements?: Array<{ type: "mrkdwn"; text: string }>;
}

interface SlackConfig {
  /** The display name to show as the bot identity (optional). */
  bot_name?: string;
  /** Override channel (optional — usually set in the webhook URL itself). */
  channel?: string;
}

function buildBlocks(event: EventPayload): SlackBlock[] {
  const blocks: SlackBlock[] = [];

  // Headline — bold title with the event-type chip
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${event.title}*\n${event.body}`,
    },
  });

  if (event.link) {
    blocks.push({
      type: "context",
      elements: [
        { type: "mrkdwn", text: `<${event.link}|Open in Nautilus →>` },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text: `_${humanizeEventType(event.type)} · ${new Date(
          event.occurred_at ?? Date.now()
        ).toLocaleString("en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        })}_`,
      },
    ],
  });

  return blocks;
}

function humanizeEventType(t: string): string {
  return t
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Post a Nautilus event to the given Slack integration's webhook URL.
 *
 * Returns the HTTP status the webhook responded with. Slack returns 200
 * with body "ok" on success; anything else means the message didn't land
 * and the integration should be marked errored (caller decides).
 *
 * Throws PROVIDER errors only on misconfiguration (no URL stored, bad
 * decryption); network/HTTP failures are returned as { ok: false }.
 */
export async function sendSlackEvent(
  integration: IntegrationRecord,
  event: EventPayload
): Promise<{ ok: boolean; status?: number; body?: string; error?: string }> {
  if (!integration.credentials_encrypted) {
    return { ok: false, error: "No webhook URL configured" };
  }

  let webhookUrl: string;
  try {
    webhookUrl = decrypt(integration.credentials_encrypted);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? `Couldn't decrypt webhook URL: ${err.message}`
          : "Decryption failed",
    };
  }

  if (
    !webhookUrl.startsWith("https://hooks.slack.com/services/") &&
    !webhookUrl.startsWith("https://hooks.slack.com/triggers/")
  ) {
    return { ok: false, error: "Stored URL doesn't look like a Slack webhook" };
  }

  const cfg = (integration.config ?? {}) as SlackConfig;

  const payload = {
    username: cfg.bot_name || "Nautilus",
    icon_emoji: ":anchor:",
    ...(cfg.channel ? { channel: cfg.channel } : {}),
    text: event.title, // fallback for notifications / mobile previews
    blocks: buildBlocks(event),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, body };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Network error",
    };
  }
}

/** Quick connectivity test — sends a fixed "hello" event. */
export async function testSlackIntegration(
  integration: IntegrationRecord
): Promise<{ ok: boolean; error?: string }> {
  const result = await sendSlackEvent(integration, {
    type: "low_stock",
    org_id: integration.org_id,
    title: "Slack integration connected",
    body: "Test message from Nautilus. If you're seeing this, alerts will land here.",
    occurred_at: new Date().toISOString(),
  });
  return { ok: result.ok, error: result.error };
}
