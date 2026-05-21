import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { encrypt } from "@/lib/integrations/crypto";
import {
  exchangeCodeForToken,
  normalizeShopDomain,
  verifyShopifyOauthCallback,
  verifyState,
} from "@/lib/integrations/shopify/oauth";
import {
  ShopifyClient,
  clientFromIntegration,
} from "@/lib/integrations/shopify/client";
import { SHOPIFY_WEBHOOK_TOPICS } from "@/lib/integrations/shopify/types";
import type { IntegrationRecord } from "@/lib/integrations/types";

/**
 * Shopify redirects here after the user approves the install. Query params:
 *   code   - exchange this for an access token
 *   shop   - the shop domain
 *   state  - the signed state we generated in /connect
 *   hmac   - signature of the rest of the query string
 *   host, timestamp - Shopify metadata
 */
export async function GET(req: NextRequest) {
  const apiKey = process.env.SHOPIFY_API_KEY;
  const apiSecret = process.env.SHOPIFY_API_SECRET;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!apiKey || !apiSecret || !appUrl) {
    return errorRedirect(req, "config_missing");
  }

  const params = req.nextUrl.searchParams;

  // 1. Verify Shopify's HMAC on the callback query
  if (!verifyShopifyOauthCallback(params, apiSecret)) {
    return errorRedirect(req, "hmac_invalid");
  }

  // 2. Verify our state token
  const state = params.get("state") ?? "";
  const stateResult = verifyState(state, apiSecret);
  if (!stateResult.ok) {
    return errorRedirect(req, `state_${stateResult.reason}`);
  }
  const orgId = stateResult.orgId;

  // 3. Normalize + verify shop domain
  const shopDomain = normalizeShopDomain(params.get("shop") ?? "");
  if (!shopDomain) {
    return errorRedirect(req, "shop_invalid");
  }

  // 4. Exchange code for token
  const code = params.get("code") ?? "";
  if (!code) return errorRedirect(req, "code_missing");

  const exchange = await exchangeCodeForToken({
    shopDomain,
    apiKey,
    apiSecret,
    code,
  });
  if (!exchange.ok) {
    console.error("[shopify oauth] exchange failed:", exchange.error);
    return errorRedirect(req, "token_exchange_failed");
  }

  // 5. Encrypt + upsert the integration row
  const admin = createAdminClient();
  const encryptedToken = encrypt(exchange.accessToken);

  const { data: integration, error: upsertErr } = await admin
    .from("integrations")
    .upsert(
      {
        org_id: orgId,
        provider: "shopify",
        status: "connected",
        external_account_id: shopDomain,
        credentials_encrypted: encryptedToken,
        config: {
          shop_domain: shopDomain,
          default_facility_id: null,
          webhook_ids: [],
          scopes: exchange.scope.split(","),
        },
        events_enabled: [],
        connected_at: new Date().toISOString(),
        last_error: null,
      },
      { onConflict: "org_id,provider" }
    )
    .select(
      "id, org_id, provider, status, config, credentials_encrypted, events_enabled"
    )
    .single();

  if (upsertErr || !integration) {
    console.error("[shopify oauth] upsert failed:", upsertErr);
    return errorRedirect(req, "save_failed");
  }

  // 6. Register webhooks. Failures here don't abort the connection —
  //    the user can re-register from the config page.
  const webhookIds = await registerWebhooks(
    integration as IntegrationRecord,
    appUrl
  );

  if (webhookIds.length > 0) {
    const cfg = integration.config as Record<string, unknown>;
    await admin
      .from("integrations")
      .update({
        config: { ...cfg, webhook_ids: webhookIds },
      })
      .eq("id", integration.id);
  }

  // 7. Pick a default facility — first active warehouse in the org.
  //    User can change this from the config page.
  const { data: firstFacility } = await admin
    .from("warehouses")
    .select("id")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("name", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstFacility) {
    const cfg = integration.config as Record<string, unknown>;
    await admin
      .from("integrations")
      .update({
        config: {
          ...cfg,
          default_facility_id: firstFacility.id,
          webhook_ids: webhookIds,
        },
      })
      .eq("id", integration.id);
  }

  return NextResponse.redirect(new URL("/integrations/shopify?ok=1", req.url));
}

async function registerWebhooks(
  integration: IntegrationRecord,
  appUrl: string
): Promise<number[]> {
  const built = clientFromIntegration(integration);
  if ("error" in built) {
    console.error("[shopify webhooks] client failed:", built.error);
    return [];
  }

  const callbackUrl = `${appUrl}/api/webhooks/shopify`;
  const ids: number[] = [];

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const result = await built.client.createWebhook(topic, callbackUrl);
    if (result.ok) {
      ids.push(result.id);
    } else {
      // 422 with "already exists" is common when reconnecting — not fatal
      console.warn(
        `[shopify webhooks] register ${topic} failed:`,
        result.error
      );
    }
  }

  return ids;
}

function errorRedirect(req: NextRequest, code: string) {
  return NextResponse.redirect(
    new URL(`/integrations/shopify?err=${code}`, req.url)
  );
}
