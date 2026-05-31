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
  created_at: string | null;
  updated_at: string | null;
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
          | "id"
          | "created_at"
          | "updated_at"
          | "deleted_at"
          | "logo_url"
          | "auto_draft_pos_enabled"
          | "industry"
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
        Insert: WithGenerated<
          ProfileRow,
          | "phone"
          | "avatar_url"
          | "default_warehouse_id"
          | "is_active"
          | "created_at"
          | "updated_at"
          | "nav_prefs"
        >;
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
          "id" | "created_at" | "updated_at" | "track_lots"
        >;
        Update: Partial<ProductRow>;
        Relationships: [];
      };
      lots: {
        Row: LotRow;
        Insert: WithGenerated<
          LotRow,
          "id" | "created_at" | "received_at" | "supplier_id" | "notes" | "created_by"
        >;
        Update: Partial<LotRow>;
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

      // Tables that the dashboard doesn't touch in v1 — fill in as needed.
      orders: StubTable;
      order_items: StubTable;
      purchase_orders: StubTable;
      po_line_items: StubTable;
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
