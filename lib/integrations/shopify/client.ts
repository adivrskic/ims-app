import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { decrypt } from "@/lib/integrations/crypto";
import type { IntegrationRecord } from "@/lib/integrations/types";
import type {
  ShopifyConfig,
  ShopifyWebhookTopic,
} from "@/lib/integrations/shopify/types";

/** Admin API version we target (matches the hand-written types). */
export const SHOPIFY_API_VERSION = "2024-10";

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
 * Authenticated Shopify Admin REST client. Holds the shop domain + access token
 * and signs every request with the X-Shopify-Access-Token header.
 */
export class ShopifyClient {
  constructor(
    public readonly shopDomain: string,
    public readonly accessToken: string
  ) {}

  private base(): string {
    return `https://${this.shopDomain}/admin/api/${SHOPIFY_API_VERSION}`;
  }

  private async request(
    path: string,
    init?: RequestInit
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    try {
      const res = await fetch(`${this.base()}${path}`, {
        ...init,
        headers: {
          "X-Shopify-Access-Token": this.accessToken,
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
        cache: "no-store",
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          error: `Shopify ${res.status}: ${body.slice(0, 200) || res.statusText}`,
        };
      }
      // DELETE responses may be empty.
      if (res.status === 204) return { ok: true, data: null };
      const data = await res.json().catch(() => null);
      return { ok: true, data };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Shopify request failed",
      };
    }
  }

  /** GET /shop.json — used for "Test connection". */
  async getShopInfo(): Promise<GetShopInfoResult> {
    const r = await this.request("/shop.json");
    if (!r.ok) return { ok: false, error: r.error };
    const shop = (r.data as { shop?: { name?: string } } | null)?.shop;
    if (!shop?.name) {
      return { ok: false, error: "Unexpected shop.json response" };
    }
    return { ok: true, shop: { name: shop.name } };
  }

  /** POST /webhooks.json — subscribe to a topic. */
  async createWebhook(
    topic: ShopifyWebhookTopic,
    callbackUrl: string
  ): Promise<CreateWebhookResult> {
    const r = await this.request("/webhooks.json", {
      method: "POST",
      body: JSON.stringify({
        webhook: { topic, address: callbackUrl, format: "json" },
      }),
    });
    if (!r.ok) return { ok: false, error: r.error };
    const id = (r.data as { webhook?: { id?: number } } | null)?.webhook?.id;
    if (typeof id !== "number") {
      return { ok: false, error: "Webhook created but no id returned" };
    }
    return { ok: true, id };
  }

  /** DELETE /webhooks/{id}.json — best-effort cleanup on disconnect. */
  async deleteWebhook(id: number): Promise<void> {
    await this.request(`/webhooks/${id}.json`, { method: "DELETE" });
  }
}

export type ClientFromIntegrationResult =
  | { client: ShopifyClient }
  | { error: string };

/**
 * Build a ShopifyClient from a stored integration row: read the shop domain
 * from config and decrypt the access token from credentials_encrypted.
 */
export function clientFromIntegration(
  integration: IntegrationRecord
): ClientFromIntegrationResult {
  const config = (integration.config ?? {}) as Partial<ShopifyConfig>;
  const shopDomain = config.shop_domain;
  if (!shopDomain) {
    return { error: "Shopify integration is missing its shop domain" };
  }
  if (!integration.credentials_encrypted) {
    return { error: "Shopify integration has no stored access token" };
  }
  let accessToken: string;
  try {
    accessToken = decrypt(integration.credentials_encrypted);
  } catch {
    return { error: "Could not decrypt the Shopify access token" };
  }
  return { client: new ShopifyClient(shopDomain, accessToken) };
}

/**
 * Verify a Shopify webhook HMAC: base64(HMAC-SHA256(rawBody, apiSecret)) must
 * equal the X-Shopify-Hmac-Sha256 header, compared in constant time.
 */
export function verifyShopifyWebhook(
  rawBody: string,
  signature: string | null,
  apiSecret: string
): boolean {
  if (!signature || !apiSecret) return false;
  const digest = createHmac("sha256", apiSecret)
    .update(rawBody, "utf8")
    .digest("base64");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
