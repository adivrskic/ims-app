"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/integrations/crypto";
import { testResendIntegration } from "@/lib/integrations/resend";
import type { IntegrationRecord } from "@/lib/integrations/types";

export interface ConnectResendResult {
  error?: string;
  success?: string;
}

/** Validate a from-address: either "name@domain" or "Display Name <name@domain>". */
function isValidFromAddress(raw: string): boolean {
  const angleMatch = raw.match(/^.+<([^>]+)>$/);
  const email = angleMatch ? angleMatch[1] : raw;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function connectResend(
  _prev: ConnectResendResult | undefined,
  formData: FormData
): Promise<ConnectResendResult> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "Not signed in to a workspace" };
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can configure integrations" };
  }

  const apiKey = String(formData.get("api_key") ?? "").trim();
  const fromAddress = String(formData.get("from_address") ?? "").trim();
  const replyTo = String(formData.get("reply_to") ?? "").trim();
  const eventsEnabled = formData.getAll("events").map(String);

  // If the user is editing an existing connection without re-pasting the
  // key, skip the API-key validation but require everything else.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("integrations")
    .select("id, credentials_encrypted")
    .eq("org_id", ctx.orgId)
    .eq("provider", "resend")
    .maybeSingle();

  if (!existing && !apiKey) {
    return { error: "Paste your Resend API key" };
  }
  if (apiKey && !apiKey.startsWith("re_")) {
    return {
      error:
        "That doesn't look like a Resend API key — they start with re_ followed by a long random string.",
    };
  }
  if (!fromAddress) {
    return { error: "From-address is required" };
  }
  if (!isValidFromAddress(fromAddress)) {
    return {
      error:
        'From-address must be either "name@yourdomain.com" or "Display Name <name@yourdomain.com>"',
    };
  }
  if (replyTo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    return { error: "Reply-to must be a valid email address" };
  }

  // Encrypt the key (only if a fresh one was pasted).
  const credentialsEncrypted = apiKey
    ? encrypt(apiKey)
    : existing!.credentials_encrypted;

  const config: Record<string, string> = { from_address: fromAddress };
  if (replyTo) config.reply_to = replyTo;

  const { data: integration, error } = await admin
    .from("integrations")
    .upsert(
      {
        org_id: ctx.orgId,
        provider: "resend",
        status: "connected",
        credentials_encrypted: credentialsEncrypted,
        config,
        events_enabled: eventsEnabled,
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

  // Send a test email to the connecting user. If Resend rejects, mark
  // errored so the UI surfaces the problem.
  const { data: orgRow } = await admin
    .from("orgs")
    .select("name")
    .eq("id", ctx.orgId)
    .maybeSingle();
  const orgName = orgRow?.name ?? "your workspace";

  const userEmail = ctx.user.email;
  if (userEmail) {
    const test = await testResendIntegration(
      integration as IntegrationRecord,
      userEmail,
      orgName
    );
    if (!test.ok) {
      await admin
        .from("integrations")
        .update({
          status: "error",
          last_error: test.error ?? "Test send failed",
        })
        .eq("id", integration.id);
      return {
        error: `Saved, but test send failed: ${
          test.error ?? "Resend didn't respond"
        }. Check that your from-domain is verified in Resend.`,
      };
    }
  }

  revalidatePath("/integrations");
  revalidatePath("/integrations/resend");
  return { success: `Connected — a test email just landed at ${userEmail}.` };
}

export async function disconnectResend(): Promise<void> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;

  const admin = createAdminClient();
  await admin
    .from("integrations")
    .delete()
    .eq("org_id", ctx.orgId)
    .eq("provider", "resend");

  revalidatePath("/integrations");
  redirect("/integrations");
}

export async function reTestResend(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in" };
  if (!ctx.user.email) return { ok: false, error: "Your account has no email" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("integrations")
    .select(
      "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
    )
    .eq("org_id", ctx.orgId)
    .eq("provider", "resend")
    .maybeSingle();
  if (!row) return { ok: false, error: "Not connected" };

  const { data: orgRow } = await admin
    .from("orgs")
    .select("name")
    .eq("id", ctx.orgId)
    .maybeSingle();
  const orgName = orgRow?.name ?? "your workspace";

  const result = await testResendIntegration(
    row as IntegrationRecord,
    ctx.user.email,
    orgName
  );

  if (result.ok) {
    await admin
      .from("integrations")
      .update({
        status: "connected",
        last_error: null,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    revalidatePath("/integrations/resend");
  }
  return result;
}
