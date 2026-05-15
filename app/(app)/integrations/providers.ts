export interface ProviderInfo {
  key: string;
  name: string;
  category:
    | "Commerce"
    | "Accounting"
    | "Payments"
    | "Shipping"
    | "Notifications"
    | "Automation"
    | "CRM";
  description: string;
  brandColor: string; // hex
  initials: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    key: "shopify",
    name: "Shopify",
    category: "Commerce",
    description:
      "Sync products and orders bidirectionally with your Shopify storefront.",
    brandColor: "#7AB55C",
    initials: "Sh",
  },
  {
    key: "square",
    name: "Square",
    category: "Commerce",
    description:
      "Pull POS receipts and reconcile in-store inventory in real time.",
    brandColor: "#3E4348",
    initials: "Sq",
  },
  {
    key: "woocommerce",
    name: "WooCommerce",
    category: "Commerce",
    description:
      "Native WordPress storefront sync for products, orders, and refunds.",
    brandColor: "#7F54B3",
    initials: "Wo",
  },
  {
    key: "quickbooks",
    name: "QuickBooks Online",
    category: "Accounting",
    description:
      "Export purchase orders and reconcile inventory cost to your ledger.",
    brandColor: "#2CA01C",
    initials: "Qb",
  },
  {
    key: "xero",
    name: "Xero",
    category: "Accounting",
    description: "Two-way sync of bills, POs, and inventory adjustments.",
    brandColor: "#13B5EA",
    initials: "Xe",
  },
  {
    key: "stripe",
    name: "Stripe",
    category: "Payments",
    description:
      "Match customer orders against Stripe charges and surface refunds.",
    brandColor: "#635BFF",
    initials: "St",
  },
  {
    key: "shipstation",
    name: "ShipStation",
    category: "Shipping",
    description:
      "Generate labels, track outbound shipments, and update fulfillment status.",
    brandColor: "#0E5E9D",
    initials: "Ss",
  },
  {
    key: "fedex",
    name: "FedEx",
    category: "Shipping",
    description:
      "Direct FedEx label printing and live tracking for installer deliveries.",
    brandColor: "#4D148C",
    initials: "Fx",
  },
  {
    key: "slack",
    name: "Slack",
    category: "Notifications",
    description:
      "Post low-stock alerts, order events, and daily summaries to channels.",
    brandColor: "#4A154B",
    initials: "Sl",
  },
  {
    key: "gmail",
    name: "Gmail",
    category: "Notifications",
    description: "Email pick lists, packing slips, and delivery confirmations.",
    brandColor: "#EA4335",
    initials: "Gm",
  },
  {
    key: "resend",
    name: "Resend",
    category: "Notifications",
    description:
      "Transactional email infrastructure for branded customer comms.",
    brandColor: "#000000",
    initials: "Re",
  },
  {
    key: "zapier",
    name: "Zapier",
    category: "Automation",
    description:
      "Trigger 6,000+ apps from any Nimbus event — scans, orders, low stock.",
    brandColor: "#FF4F00",
    initials: "Za",
  },
  {
    key: "hubspot",
    name: "HubSpot",
    category: "CRM",
    description:
      "Push customers and orders into HubSpot contacts and deal pipelines.",
    brandColor: "#FF7A59",
    initials: "Hs",
  },
];
