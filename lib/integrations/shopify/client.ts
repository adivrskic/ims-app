// TODO(stub): Real Shopify Admin API client. This module was referenced by
// shopify/actions.ts, the OAuth callback route, and the webhook route but was
// never implemented. The real implementation needs to:
//   - Build an authenticated client from a stored IntegrationRecord
//     (decrypt credentials via @/lib/integrations/crypto, read shop domain
//     from config), returning either { client } or { error }.
//   - ShopifyClient should hit the Shopify Admin REST/GraphQL API for
//     getShopInfo / createWebhook / deleteWebhook.
//   - verifyShopifyWebhook should HMAC-verify the raw request body against the
//     app secret (base64 SHA-256) per Shopify's webhook signing spec.

import type { IntegrationRecord } from "@/lib/integrations/types";
import type { ShopifyWebhookTopic } from "@/lib/integrations/shopify/types";

export interface ShopInfo {
  name: string;
}

export type GetShopInfoResult =
  | { ok: true; shop: ShopInfo }
  | { ok: false; error: string };

export type CreateWebhookResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

/**
 * TODO(stub): authenticated Shopify Admin API client. Every method is a
 * safe no-op default so callers type-check without performing real network IO.
 */
export class ShopifyClient {
  // TODO(stub): hold shop domain + access token once implemented.
  constructor(
    public readonly shopDomain: string,
    public readonly accessToken: string
  ) {}

  // TODO(stub): fetch /admin/api/.../shop.json
  async getShopInfo(): Promise<GetShopInfoResult> {
    return { ok: false, error: "ShopifyClient.getShopInfo not implemented" };
  }

  // TODO(stub): POST /admin/api/.../webhooks.json
  async createWebhook(
    _topic: ShopifyWebhookTopic,
    _callbackUrl: string
  ): Promise<CreateWebhookResult> {
    return { ok: false, error: "ShopifyClient.createWebhook not implemented" };
  }

  // TODO(stub): DELETE /admin/api/.../webhooks/{id}.json
  async deleteWebhook(_id: number): Promise<void> {
    return;
  }
}

export type ClientFromIntegrationResult =
  | { client: ShopifyClient }
  | { error: string };

/**
 * TODO(stub): build a ShopifyClient from a stored integration row by decrypting
 * its credentials and reading the shop domain from config. Currently always
 * returns an error so disconnect/verify flows degrade gracefully.
 */
export function clientFromIntegration(
  _integration: IntegrationRecord
): ClientFromIntegrationResult {
  return { error: "clientFromIntegration not implemented" };
}

/**
 * TODO(stub): verify a Shopify webhook HMAC. Returns false so unverified
 * payloads are rejected until the real HMAC check is implemented.
 */
export function verifyShopifyWebhook(
  _rawBody: string,
  _signature: string | null,
  _apiSecret: string
): boolean {
  return false;
}
