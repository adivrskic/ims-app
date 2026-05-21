/**
 * The events any integration can subscribe to. Add to this list when you
 * add a new notification kind; the dispatch layer fans out based on
 * exact event-type matches with each integration's events_enabled array.
 *
 * Keep these stable — they're stored in the database in events_enabled.
 */
export const INTEGRATION_EVENTS = [
  "low_stock",
  "scan_burst",
  "po_received",
  "cycle_count_variance",
  "daily_summary",
] as const;

export type IntegrationEvent = (typeof INTEGRATION_EVENTS)[number];

interface EventMetaEntry {
  label: string;
  description: string;
}

/** Human-readable copy for each event. */
export const EVENT_META: Record<IntegrationEvent, EventMetaEntry> = {
  low_stock: {
    label: "Low stock alerts",
    description: "A product hit or dropped below its reorder point.",
  },
  scan_burst: {
    label: "Scan bursts",
    description: "Unusually high scan volume at a facility.",
  },
  po_received: {
    label: "Purchase orders received",
    description: "A PO line was fully or partially received.",
  },
  cycle_count_variance: {
    label: "Cycle count variances",
    description:
      "A cycle count produced a non-zero variance vs. system quantity.",
  },
  daily_summary: {
    label: "Daily summary",
    description: "End-of-day digest of scans, alerts, and exceptions.",
  },
};

/**
 * Payload shape an integration receives when an event fires. Each event
 * type's `data` is provider-agnostic — formatting (e.g. into Slack
 * blocks) happens in each provider's adapter.
 */
export interface EventPayload {
  type: IntegrationEvent;
  org_id: string;
  title: string;
  body: string;
  /** Optional link back to the relevant page in Nautilus. */
  link?: string;
  /** Optional structured context (product_id, qty, etc.). */
  data?: Record<string, unknown>;
  /** ISO timestamp; defaults to now. */
  occurred_at?: string;
}

/**
 * The shape we read from the integrations table when dispatching. Mirrors
 * the DB columns we care about, with credentials still encrypted.
 */
export interface IntegrationRecord {
  id: string;
  org_id: string;
  provider: string;
  status: "connected" | "error" | "disconnected";
  config: Record<string, unknown>;
  credentials_encrypted: string | null;
  events_enabled: string[];
}
