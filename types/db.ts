/**
 * Database types for the Nimbus `app` schema.
 *
 * Hand-written from the live schema inspected on the `nimbus-wms` Supabase
 * project. Regenerate with:
 *
 *   supabase gen types typescript --project-id seypbrzjjiuibrwyxewj --schema app > types/supabase.ts
 *
 * Requires `app` to be added to API → Exposed schemas in the dashboard.
 *
 * Only tables touched by the dashboard v1 are typed in detail. The rest are
 * stubbed with permissive shapes and can be filled in as features land.
 *
 * IMPORTANT: keep table shapes non-recursive. supabase-js's generic resolver
 * falls back to `never` when it encounters circular references like
 * `Database['app']['Tables']['foo']['Row']` inside the same table definition.
 */

// ── Row types ─────────────────────────────────────────────────────────────

export interface OrgRow {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Opt-in for the scheduled auto-draft-PO cron. Defaults false. */
  auto_draft_pos_enabled: boolean;
  /** Industry vertical slug (drives default nav) or null. */
  industry: string | null;
  /** Plan tier (starter | pro | enterprise). Defaults 'starter'. */
  tier: string;
  /** Staff user who provisioned via /admin/onboard (null for self-signup). */
  onboarded_by: string | null;
  onboarded_at: string | null;
  /** Internal staff notes captured at onboarding. */
  notes: string | null;
}

export interface OrgMemberRow {
  org_id: string;
  user_id: string;
  role: "owner" | "admin" | "member";
  joined_at: string | null;
}

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  default_warehouse_id: string | null;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  /** Per-user sidenav prefs (keys), or null = use industry defaults. */
  nav_prefs: { order: string[]; hidden: string[] } | null;
}

export interface WarehouseRow {
  id: string;
  org_id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  owner_id: string | null;
  layout_json: unknown;
  is_active: boolean | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface SectionRow {
  id: string;
  org_id: string;
  warehouse_id: string | null;
  code: string;
  name: string;
  total_bays: number;
  total_levels: number;
  color: string | null;
  default_category: string | null;
  position_json: unknown;
  sort_order: number | null;
  created_at: string | null;
}

export interface CategoryRow {
  id: string;
  org_id: string;
  name: string;
  icon: string | null;
  color: string | null;
  sort_order: number | null;
}

export interface ProductRow {
  id: string;
  org_id: string;
  barcode: string;
  internal_sku: string | null;
  name: string;
  category_id: string | null;
  weight: string | null;
  dimensions: string | null;
  manufacturer: string | null;
  notes: string | null;
  photo_url: string | null;
  reorder_point: number | null;
  /** Opt-in: this product is lot/batch + expiry tracked. */
  track_lots: boolean;
  /** Opt-in: this product is a kit/assembly defined by kit_components. */
  is_kit: boolean;
  /** Opt-in: this product is serialized (unit-level tracking). */
  track_serials: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export type SerialStatus = "in_stock" | "shipped" | "returned" | "scrapped";

export interface SerialUnitRow {
  id: string;
  org_id: string;
  product_id: string;
  serial_number: string;
  status: SerialStatus;
  warehouse_id: string | null;
  lot_id: string | null;
  received_at: string | null;
  shipped_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface KitComponentRow {
  id: string;
  org_id: string;
  kit_product_id: string;
  component_product_id: string;
  quantity: number;
  created_at: string;
}

export interface LotRow {
  id: string;
  org_id: string;
  product_id: string;
  lot_number: string;
  supplier_id: string | null;
  received_at: string | null;
  expires_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface LocationRow {
  id: string;
  org_id: string;
  product_id: string | null;
  section_id: string | null;
  warehouse_id: string | null;
  bay: number;
  level: number;
  quantity: number | null;
  is_active: boolean | null;
  placed_by: string | null;
  placed_at: string | null;
  updated_at: string | null;
}

export interface ScanHistoryRow {
  id: string;
  org_id: string;
  product_id: string | null;
  warehouse_id: string | null;
  scanned_by: string | null;
  action: ScanAction;
  from_location: unknown;
  to_location: unknown;
  quantity: number | null;
  notes: string | null;
  scanned_at: string | null;
}

// ── Enums ─────────────────────────────────────────────────────────────────

export type ScanAction =
  | "register"
  | "locate"
  | "relocate"
  | "pick"
  | "receive"
  | "return"
  | "cycle_count"
  | "adjust"
  | "putaway"
  | "transfer";

export type OrderStatus =
  | "created"
  | "pick_list_assigned"
  | "in_progress"
  | "staged"
  | "ready"
  | "out_for_delivery"
  | "complete"
  | "cancelled";

export type OrderType =
  | "installer_job"
  | "customer_pickup"
  | "internal_transfer"
  | "restock";

export type PoStatus =
  | "draft"
  | "sent"
  | "partially_received"
  | "fully_received"
  | "cancelled";

export type ReturnDisposition =
  | "restock"
  | "damaged"
  | "hold_for_inspection"
  | "supplier_return";

export interface ReturnRow {
  id: string;
  org_id: string;
  warehouse_id: string | null;
  product_id: string | null;
  order_id: string | null;
  quantity: number;
  disposition: ReturnDisposition;
  reason: string | null;
  photo_url: string | null;
  received_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string | null;
}

export interface UserSessionRow {
  id: string;
  user_id: string;
  device_id: string;
  user_agent: string | null;
  ip: string | null;
  revoked_at: string | null;
  created_at: string;
  last_seen_at: string;
}
