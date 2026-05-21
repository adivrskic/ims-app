"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/data/user";
import { createAdminClient } from "@/lib/supabase/admin";
import { clientFromIntegration } from "@/lib/integrations/shopify/client";
import type { IntegrationRecord } from "@/lib/integrations/types";
import type { ShopifyConfig } from "@/lib/integrations/shopify/types";

/** Server-action helper to kick off OAuth. Receives a shop domain. */
export async function startShopifyOauth(
  _prev: { error?: string } | undefined,
  formData: FormData
): Promise<{ error?: string }> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "Not signed in" };
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can connect integrations" };
  }

  const shop = String(formData.get("shop") ?? "").trim();
  if (!shop) return { error: "Enter your shop domain" };

  redirect(
    `/api/integrations/shopify/connect?shop=${encodeURIComponent(shop)}`
  );
}

/** Update the default fulfillment facility for incoming orders. */
export async function updateDefaultFacility(
  facilityId: string
): Promise<{ error?: string; success?: string }> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { error: "Not signed in" };
  if (!["owner", "admin"].includes(ctx.role)) {
    return { error: "Only admins can edit integration config" };
  }

  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("integrations")
    .select("id, config")
    .eq("org_id", ctx.orgId)
    .eq("provider", "shopify")
    .maybeSingle();
  if (!integration) return { error: "Shopify isn't connected" };

  const config = integration.config as Record<string, unknown>;
  await admin
    .from("integrations")
    .update({
      config: { ...config, default_facility_id: facilityId },
    })
    .eq("id", integration.id);

  revalidatePath("/integrations/shopify");
  return { success: "Default facility updated" };
}

/** Verify the connection is still alive by hitting /shop.json. */
export async function testShopify(): Promise<{
  ok: boolean;
  shopName?: string;
  error?: string;
}> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return { ok: false, error: "Not signed in" };

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("integrations")
    .select(
      "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
    )
    .eq("org_id", ctx.orgId)
    .eq("provider", "shopify")
    .maybeSingle();
  if (!row) return { ok: false, error: "Not connected" };

  const built = clientFromIntegration(row as IntegrationRecord);
  if ("error" in built) return { ok: false, error: built.error };

  const shop = await built.client.getShopInfo();
  if (!shop.ok) {
    await admin
      .from("integrations")
      .update({
        status: "error",
        last_error: shop.error,
      })
      .eq("id", row.id);
    revalidatePath("/integrations/shopify");
    return { ok: false, error: shop.error };
  }

  await admin
    .from("integrations")
    .update({
      status: "connected",
      last_error: null,
      last_synced_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  revalidatePath("/integrations/shopify");
  return { ok: true, shopName: shop.shop.name };
}

/** Disconnect: delete webhooks from Shopify side, then remove the integration row. */
export async function disconnectShopify(): Promise<void> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return;
  if (!["owner", "admin"].includes(ctx.role)) return;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from("integrations")
    .select(
      "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
    )
    .eq("org_id", ctx.orgId)
    .eq("provider", "shopify")
    .maybeSingle();

  if (row) {
    // Best-effort: delete webhooks from Shopify so they stop calling us.
    const cfg = row.config as unknown as ShopifyConfig;
    const built = clientFromIntegration(row as IntegrationRecord);
    if (!("error" in built) && cfg?.webhook_ids?.length > 0) {
      await Promise.all(
        cfg.webhook_ids.map((id) =>
          built.client.deleteWebhook(id).catch(() => null)
        )
      );
    }

    await admin.from("integrations").delete().eq("id", row.id);
  }

  revalidatePath("/integrations");
  redirect("/integrations");
}
