/**
 * Shared types for natural-language search (§3). No "server-only" / "use
 * server" directive here on purpose — both the client CommandPalette (type-only
 * import) and the server action import these. Keep it dependency-free.
 */

/**
 * Structured intent the nl-query edge function returns. The model NEVER emits
 * SQL — it picks an entity + whitelisted filters, and the server action
 * (nlSearch) decides the actual query. This keeps the model out of the trust
 * boundary for data access.
 */
export interface NlQueryIntent {
  entity: "product" | "location" | "scan" | "order" | "unknown";
  filters?: {
    /** Free-text match against name / barcode. */
    text?: string;
    /** on_hand <= reorder_point. */
    lowStock?: boolean;
    /** Section/aisle code, e.g. "A3". */
    sectionCode?: string;
    /** Scan action filter, e.g. "pick". */
    action?: string;
    /** Recency window in days. */
    sinceDays?: number;
  };
  sort?: { field: string; dir: "asc" | "desc" };
  limit?: number;
}

export interface NlResult {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
}

export interface NlSearchResponse {
  /** Short human echo of what was searched, shown above results. */
  interpreted: string;
  results: NlResult[];
}
