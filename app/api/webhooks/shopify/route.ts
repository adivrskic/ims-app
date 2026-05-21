import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyShopifyWebhook } from "@/lib/integrations/shopify/client";
import {
  ingestShopifyOrder,
  cancelShopifyOrder,
} from "@/lib/integrations/shopify/ingest";
import type {
  ShopifyConfig,
  ShopifyOrder,
} from "@/lib/integrations/shopify/types";

export const runtime = "nodejs";

/**
 * Shopify webhook receiver.
 *
 * Headers Shopify sends:
 *   X-Shopify-Topic           - e.g. "orders/create"
 *   X-Shopify-Hmac-Sha256     - base64 HMAC of raw body w/ app API secret
 *   X-Shopify-Shop-Domain     - e.g. "my-shop.myshopify.com"
 *   X-Shopify-Webhook-Id      - idempotency key
 *   X-Shopify-API-Version
 *
 * We MUST verify HMAC against the unmodified raw body — Shopify retries
 * for >5s, so we log the payload first, return 200 fast, and process async.
 */
export async function POST(req: NextRequest) {
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  if (!apiSecret) {
    console.error("[shopify webhook] SHOPIFY_API_SECRET not set");
    return new NextResponse("Server misconfigured", { status: 500 });
  }

  // Read raw body for HMAC. Do NOT parse JSON before this.
  const rawBody = await req.text();
  const signature = req.headers.get("x-shopify-hmac-sha256") ?? "";
  if (!verifyShopifyWebhook(rawBody, signature, apiSecret)) {
    console.warn("[shopify webhook] HMAC verification failed");
    return new NextResponse("Invalid signature", { status: 401 });
  }

  const topic = req.headers.get("x-shopify-topic") ?? "";
  const shopDomain = req.headers.get("x-shopify-shop-domain") ?? "";
  const webhookId = req.headers.get("x-shopify-webhook-id") ?? "";

  if (!topic || !shopDomain) {
    return new NextResponse("Missing headers", { status: 400 });
  }

  // Look up the integration by shop domain to find the org
  const admin = createAdminClient();
  const { data: integration } = await admin
    .from("integrations")
    .select("id, org_id, config, status")
    .eq("provider", "shopify")
    .eq("external_account_id", shopDomain)
    .maybeSingle();

  if (!integration) {
    // No integration → either uninstalled or never installed. 200 so
    // Shopify doesn't retry forever.
    console.warn(
      `[shopify webhook] no integration for shop ${shopDomain}, topic ${topic}`
    );
    return new NextResponse("OK", { status: 200 });
  }

  // Parse payload (only after HMAC verified)
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  // Log raw payload. Unique constraint on (org_id, shopify_webhook_id)
  // gives us free idempotency — duplicate redeliveries upsert in place.
  const { data: logRow, error: logErr } = await admin
    .from("shopify_webhook_log")
    .upsert(
      {
        org_id: integration.org_id,
        topic,
        shopify_webhook_id: webhookId || null,
        shop_domain: shopDomain,
        payload: payload as Record<string, unknown>,
      },
      { onConflict: "org_id,shopify_webhook_id", ignoreDuplicates: true }
    )
    .select("id, processed_at")
    .maybeSingle();

  if (logErr) {
    console.error("[shopify webhook] log insert failed:", logErr);
    // Still try to process — better to double-ingest than miss
  }

  // If this exact webhook was already processed (duplicate retry),
  // skip the work and 200.
  if (logRow?.processed_at) {
    return new NextResponse("OK (duplicate)", { status: 200 });
  }

  // Process synchronously in v1. If we ever see processing exceed Shopify's
  // 5s timeout, move this to a queue and return immediately.
  const config = integration.config as unknown as ShopifyConfig;
  let processError: string | null = null;

  try {
    switch (topic) {
      case "orders/create":
      case "orders/updated": {
        const order = payload as ShopifyOrder;
        const result = await ingestShopifyOrder(
          integration.org_id,
          config,
          order
        );
        if (!result.ok) processError = result.error ?? "Ingest failed";
        break;
      }
      case "orders/cancelled": {
        const order = payload as ShopifyOrder;
        const result = await cancelShopifyOrder(integration.org_id, order.id);
        if (!result.ok) processError = result.error ?? "Cancel failed";
        break;
      }
      case "app/uninstalled": {
        // User uninstalled our app from Shopify. Mark integration disconnected.
        await admin
          .from("integrations")
          .update({
            status: "disconnected",
            last_error: "App uninstalled from Shopify",
          })
          .eq("id", integration.id);
        break;
      }
      default:
        // Unknown topic — log but don't error
        console.warn(`[shopify webhook] unhandled topic: ${topic}`);
    }
  } catch (err) {
    processError = err instanceof Error ? err.message : "Processor threw";
    console.error("[shopify webhook] processing failed:", err);
  }

  // Mark log row processed
  if (logRow?.id) {
    await admin
      .from("shopify_webhook_log")
      .update({
        processed_at: new Date().toISOString(),
        process_error: processError,
      })
      .eq("id", logRow.id);
  }

  // Update integration sync timestamps
  if (!processError) {
    await admin
      .from("integrations")
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", integration.id);
  } else {
    await admin
      .from("integrations")
      .update({ last_error: processError })
      .eq("id", integration.id);
  }

  return new NextResponse("OK", { status: 200 });
}
