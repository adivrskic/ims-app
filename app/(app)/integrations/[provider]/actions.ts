"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/integrations/crypto";
import { testSlackIntegration } from "@/lib/integrations/slack";
import type { IntegrationRecord } from "@/lib/integrations/types";

export interface ConnectResult {
  error?: string;
  success?: string;
}

/**
 * Connect (or update) a Slack integration. Stores the webhook URL
 * encrypted, marks the integration connected, fires a test message.
 */
export async function connectSlack(
  _prev: ConnectResult | undefined,
  formData: FormData
): Promise<ConnectResult> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "Not signed in to a workspace" };
  if (!ctx.can("integrations.manage")) {
    return { error: "Only admins can configure integrations" };
  }

  const webhookUrl = String(formData.get("webhook_url") ?? "").trim();
  const botName = String(formData.get("bot_name") ?? "").trim();
  const enabledRaw = formData.getAll("events").map(String);

  if (!webhookUrl) return { error: "Paste your Slack webhook URL" };
  if (!/^https:\/\/hooks\.slack\.com\/services\//.test(webhookUrl)) {
    return {
      error:
        "That doesn't look like a Slack webhook URL — it should start with https://hooks.slack.com/services/",
    };
  }

  const admin = createAdminClient();
  const encrypted = encrypt(webhookUrl);

  // Upsert: same org + provider = same row, updates credentials/config in place.
  const { data: integration, error } = await admin
    .from("integrations")
    .upsert(
      {
        org_id: ctx.orgId,
        provider: "slack",
        status: "connected",
        credentials_encrypted: encrypted,
        config: { bot_name: botName || null },
        events_enabled: enabledRaw,
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "org_id,provider" }
    )
    .select(
      "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
    )
    .single();

  if (error || !integration) {
    return { error: `Couldn't save the integration: ${error?.message}` };
  }

  // Fire a test message. If Slack rejects it, mark the integration errored
  // so the user sees what went wrong on the next page render.
  const test = await testSlackIntegration(integration as IntegrationRecord);
  if (!test.ok) {
    await admin
      .from("integrations")
      .update({
        status: "error",
        last_error: test.error ?? "Test message failed",
      })
      .eq("id", integration.id);
    return {
      error: `Saved, but test message failed: ${
        test.error ?? "Slack didn't respond"
      }`,
    };
  }

  revalidatePath("/integrations");
  revalidatePath("/integrations/slack");
  return { success: "Connected — a test message just landed in your channel." };
}

/** Disconnect (delete the row entirely). */
export async function disconnectSlack(): Promise<void> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return;
  if (!ctx.can("integrations.manage")) return;

  const admin = createAdminClient();
  await admin
    .from("integrations")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("provider", "slack");

  revalidatePath("/integrations");
  redirect("/integrations");
}

/** Manual re-test from the settings UI. */
export async function reTestSlack(): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("integrations")
    .select(
      "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
    )
    .eq("org_id", ctx.orgId)
    .eq("provider", "slack")
    .maybeSingle();

  if (!row) return { ok: false, error: "Not connected" };

  const result = await testSlackIntegration(row as IntegrationRecord);
  if (result.ok) {
    await admin
      .from("integrations")
      .update({
        status: "connected",
        last_error: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    revalidatePath("/integrations/slack");
  }
  return result;
}
