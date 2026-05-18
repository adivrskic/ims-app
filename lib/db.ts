/**
 * Normalize a PostgREST joined relation that may arrive as either a single
 * object (when the relationship is many-to-one) or a single-element array
 * (when the untyped client can't resolve the FK cardinality). Returns the
 * single object or null.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}
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
  unit_cost: string | null;
  lead_time_days: number | null;
  safety_stock: number;
  preferred_supplier_id: string | null;
  created_at: string | null;
  updated_at: string | null;
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

// ── P1/P2/P4 tables ───────────────────────────────────────────────────────

export interface SupplierRow {
  id: string;
  org_id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  payment_terms: string | null;
  default_lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderRow {
  id: string;
  org_id: string;
  warehouse_id: string | null;
  po_number: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_contact: string | null;
  status: PoStatus;
  expected_date: string | null;
  sent_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface PoLineItemRow {
  id: string;
  po_id: string;
  product_id: string | null;
  product_name: string | null;
  barcode: string | null;
  quantity_expected: number;
  quantity_received: number | null;
  unit_cost: string | null;
  landed_unit_cost: string | null;
  // ── P4: lot capture at receive ──────────────────────────────────────────
  lot_id: string | null;
  lot_number: string | null;
  received_at: string | null;
  received_by: string | null;
}

export interface InventorySnapshotRow {
  id: string;
  org_id: string;
  snapshot_date: string;
  total_units: number;
  total_value: string;
  sku_count: number;
  location_count: number;
  active_sku_count: number;
  low_stock_count: number;
  created_at: string;
}

/**
 * P4: lot / dye-lot record. Unique by (product_id, lot_number).
 * Created on first PO receipt that carries a lot number.
 */
export interface LotRow {
  id: string;
  org_id: string;
  product_id: string;
  lot_number: string;
  supplier_id: string | null;
  received_at: string | null;
  expires_at: string | null; // date YYYY-MM-DD
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

/**
 * P4: cycle count event. variance is generated by the DB
 * (counted_qty - expected_qty), so it's always consistent.
 */
export interface CycleCountRow {
  id: string;
  org_id: string;
  product_id: string;
  location_id: string | null;
  warehouse_id: string | null;
  expected_qty: number;
  counted_qty: number;
  variance: number;
  status: "recorded" | "adjusted" | "voided";
  notes: string | null;
  counted_by: string | null;
  counted_at: string;
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
  | "adjust";

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

// ── Insert helper ─────────────────────────────────────────────────────────

type WithGenerated<R, K extends keyof R> = Omit<R, K> & Partial<Pick<R, K>>;

// ── Database root ─────────────────────────────────────────────────────────

type StubTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: [];
};

export type Database = {
  app: {
    Tables: {
      orgs: {
        Row: OrgRow;
        Insert: WithGenerated<
          OrgRow,
          "id" | "created_at" | "updated_at" | "deleted_at" | "logo_url"
        >;
        Update: Partial<OrgRow>;
        Relationships: [];
      };
      org_members: {
        Row: OrgMemberRow;
        Insert: WithGenerated<OrgMemberRow, "joined_at">;
        Update: Partial<OrgMemberRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: ProfileRow;
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      warehouses: {
        Row: WarehouseRow;
        Insert: WithGenerated<
          WarehouseRow,
          "id" | "created_at" | "updated_at" | "layout_json"
        >;
        Update: Partial<WarehouseRow>;
        Relationships: [];
      };
      sections: {
        Row: SectionRow;
        Insert: WithGenerated<SectionRow, "id" | "created_at">;
        Update: Partial<SectionRow>;
        Relationships: [];
      };
      categories: {
        Row: CategoryRow;
        Insert: WithGenerated<CategoryRow, "id">;
        Update: Partial<CategoryRow>;
        Relationships: [];
      };
      products: {
        Row: ProductRow;
        Insert: WithGenerated<
          ProductRow,
          "id" | "created_at" | "updated_at" | "safety_stock"
        >;
        Update: Partial<ProductRow>;
        Relationships: [];
      };
      locations: {
        Row: LocationRow;
        Insert: WithGenerated<LocationRow, "id" | "placed_at" | "updated_at">;
        Update: Partial<LocationRow>;
        Relationships: [];
      };
      scan_history: {
        Row: ScanHistoryRow;
        Insert: WithGenerated<ScanHistoryRow, "id" | "scanned_at">;
        Update: Partial<ScanHistoryRow>;
        Relationships: [];
      };
      suppliers: {
        Row: SupplierRow;
        Insert: WithGenerated<
          SupplierRow,
          "id" | "created_at" | "updated_at" | "is_active"
        >;
        Update: Partial<SupplierRow>;
        Relationships: [];
      };
      purchase_orders: {
        Row: PurchaseOrderRow;
        Insert: WithGenerated<
          PurchaseOrderRow,
          "id" | "created_at" | "updated_at" | "sent_at" | "received_at"
        >;
        Update: Partial<PurchaseOrderRow>;
        Relationships: [];
      };
      po_line_items: {
        Row: PoLineItemRow;
        Insert: WithGenerated<
          PoLineItemRow,
          | "id"
          | "quantity_received"
          | "received_at"
          | "received_by"
          | "lot_id"
          | "lot_number"
        >;
        Update: Partial<PoLineItemRow>;
        Relationships: [];
      };
      inventory_snapshots: {
        Row: InventorySnapshotRow;
        Insert: WithGenerated<InventorySnapshotRow, "id" | "created_at">;
        Update: Partial<InventorySnapshotRow>;
        Relationships: [];
      };
      lots: {
        Row: LotRow;
        Insert: WithGenerated<LotRow, "id" | "created_at">;
        Update: Partial<LotRow>;
        Relationships: [];
      };
      cycle_counts: {
        Row: CycleCountRow;
        // variance is generated server-side; never insertable
        Insert: WithGenerated<
          CycleCountRow,
          "id" | "variance" | "counted_at" | "status"
        >;
        Update: Partial<CycleCountRow>;
        Relationships: [];
      };

      // Tables that the dashboard doesn't touch in detail.
      orders: StubTable;
      order_items: StubTable;
      returns: StubTable;
      integrations: StubTable;
      sync_jobs: StubTable;
      api_keys: StubTable;
      webhook_endpoints: StubTable;
      webhook_deliveries: StubTable;
      audit_log: StubTable;
      notifications: StubTable;
      user_devices: StubTable;
      warehouse_access: StubTable;
      org_invites: StubTable;
      org_subscriptions: StubTable;
      layout_snapshots: StubTable;
    };
    Views: Record<string, never>;
    Functions: {
      is_org_member: {
        Args: { target_org_id: string };
        Returns: boolean;
      };
      has_org_role: {
        Args: { target_org_id: string; allowed: string[] };
        Returns: boolean;
      };
      snapshot_inventory: {
        Args: Record<string, never>;
        Returns: void;
      };
    };
    Enums: {
      scan_action: ScanAction;
      order_status: OrderStatus;
      order_type: OrderType;
      po_status: PoStatus;
      return_disposition: ReturnDisposition;
    };
    CompositeTypes: Record<string, never>;
  };
};

// ── Enums ─────────────────────────────────────────────────────────────────
