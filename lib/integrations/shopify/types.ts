/**
 * Shopify API types — only the slice of the Admin API we actually touch.
 * Pulled from https://shopify.dev/docs/api/admin-rest/2024-10/resources/order
 *
 * Keeping these hand-written rather than generated since we use very
 * little of the full surface and Shopify's OpenAPI schema is enormous.
 */

export interface ShopifyMoney {
  amount: string;
  currency_code: string;
}

export interface ShopifyAddress {
  first_name?: string | null;
  last_name?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  province_code?: string | null;
  country?: string | null;
  country_code?: string | null;
  zip?: string | null;
  phone?: string | null;
  company?: string | null;
}

export interface ShopifyLineItem {
  id: number;
  product_id: number | null;
  variant_id: number | null;
  sku: string | null;
  title: string;
  variant_title: string | null;
  vendor: string | null;
  quantity: number;
  price: string;
  total_discount: string;
  fulfillment_status: string | null;
  requires_shipping: boolean;
}

export interface ShopifyOrder {
  id: number;
  name: string; // e.g. "#1001"
  order_number: number;
  email: string | null;
  phone: string | null;
  created_at: string;
  updated_at: string;
  processed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  financial_status: string | null;
  fulfillment_status: string | null;
  currency: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  total_shipping_price_set?: { shop_money: ShopifyMoney };
  line_items: ShopifyLineItem[];
  shipping_address: ShopifyAddress | null;
  billing_address: ShopifyAddress | null;
  customer: {
    id: number;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
  tags: string;
  note: string | null;
}

/** Shopify config stored in integrations.config */
export interface ShopifyConfig {
  shop_domain: string; // e.g. "my-store.myshopify.com"
  default_facility_id: string | null;
  webhook_ids: number[]; // Shopify's webhook subscription IDs (for cleanup on disconnect)
  scopes: string[];
}

/** Shopify webhook topics we subscribe to. */
export const SHOPIFY_WEBHOOK_TOPICS = [
  "orders/create",
  "orders/updated",
  "orders/cancelled",
  "app/uninstalled",
] as const;

export type ShopifyWebhookTopic = (typeof SHOPIFY_WEBHOOK_TOPICS)[number];
