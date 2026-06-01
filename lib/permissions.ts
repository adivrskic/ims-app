/**
 * Granular RBAC — permission registry, role defaults, and resolution.
 *
 * Pure + dependency-free so it's usable on client and server.
 *
 * Model:
 *   - A fixed set of named permissions (capabilities).
 *   - Each role has a default permission set (ROLE_DEFAULTS).
 *   - A member MAY carry an explicit `permissions` array that overrides the
 *     role default. Owners always have every permission.
 *
 * Non-regressive by construction: member defaults grant everything a member
 * could already do; the admin-only permissions correspond 1:1 to the actions
 * that were previously gated behind `["owner","admin"]`.
 */

export type Permission =
  | "inventory.manage" // products CRUD, bulk import
  | "inventory.adjust" // manual on-hand quantity edits
  | "cycle_counts.void" // void a recorded count
  | "orders.manage" // create / advance / cancel orders
  | "orders.allocate" // allocate stock to orders
  | "customers.manage" // create / edit / deactivate customers
  | "purchasing.manage" // create/send POs, auto-draft settings
  | "purchasing.receive" // receive PO lines
  | "suppliers.manage" // create / edit / deactivate suppliers
  | "qc.review" // pass/fail inbound QC
  | "picking.manage" // build / manage pick waves
  | "work_orders.manage" // create / complete work orders
  | "facilities.manage" // facility builder, sections
  | "adjustments.approve" // approve/reject queued adjustments, manage reasons
  | "reports.manage" // create / delete saved reports
  | "settings.manage" // org settings
  | "members.manage" // invite / remove / set member permissions
  | "billing.manage" // billing
  | "integrations.manage"; // connect / configure integrations

export interface PermissionDef {
  key: Permission;
  label: string;
  group: string;
}

export const PERMISSIONS: PermissionDef[] = [
  { key: "inventory.manage", label: "Manage catalog & import", group: "Inventory" },
  { key: "inventory.adjust", label: "Adjust on-hand quantities", group: "Inventory" },
  { key: "cycle_counts.void", label: "Void cycle counts", group: "Inventory" },
  { key: "orders.manage", label: "Manage orders", group: "Orders" },
  { key: "orders.allocate", label: "Allocate stock", group: "Orders" },
  { key: "customers.manage", label: "Manage customers", group: "Orders" },
  { key: "picking.manage", label: "Manage pick waves", group: "Orders" },
  { key: "purchasing.manage", label: "Manage purchase orders", group: "Purchasing" },
  { key: "purchasing.receive", label: "Receive shipments", group: "Purchasing" },
  { key: "suppliers.manage", label: "Manage suppliers", group: "Purchasing" },
  { key: "qc.review", label: "Review inbound QC", group: "Purchasing" },
  { key: "work_orders.manage", label: "Manage work orders", group: "Production" },
  { key: "reports.manage", label: "Build & manage reports", group: "Insights" },
  { key: "facilities.manage", label: "Manage facilities & layout", group: "Admin" },
  { key: "adjustments.approve", label: "Approve adjustments & reasons", group: "Admin" },
  { key: "settings.manage", label: "Manage workspace settings", group: "Admin" },
  { key: "members.manage", label: "Manage members & roles", group: "Admin" },
  { key: "integrations.manage", label: "Manage integrations", group: "Admin" },
  { key: "billing.manage", label: "Manage billing", group: "Admin" },
];

export const ALL_PERMISSIONS: Permission[] = PERMISSIONS.map((p) => p.key);

export type Role = "owner" | "admin" | "member";

/** Permissions a regular member gets by default — everything they could do
 * before RBAC existed (i.e. all non-admin-gated capabilities). */
const MEMBER_DEFAULTS: Permission[] = [
  "inventory.adjust",
  "orders.manage",
  "orders.allocate",
  "customers.manage",
  "picking.manage",
  "purchasing.receive",
  "suppliers.manage",
  "qc.review",
  "work_orders.manage",
  "reports.manage",
];

export const ROLE_DEFAULTS: Record<Role, Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  member: MEMBER_DEFAULTS,
};

export function defaultPermissionsFor(role: string): Permission[] {
  return ROLE_DEFAULTS[(role as Role) ?? "member"] ?? MEMBER_DEFAULTS;
}

const VALID = new Set<string>(ALL_PERMISSIONS);

/**
 * Resolve a member's effective permissions.
 * - Owners always get everything.
 * - A non-null `custom` array (the member's explicit set) overrides the role
 *   default; invalid keys are dropped.
 * - Otherwise the role default applies.
 */
export function effectivePermissions(
  role: string,
  custom: string[] | null | undefined
): Set<Permission> {
  if (role === "owner") return new Set(ALL_PERMISSIONS);
  if (custom != null) {
    return new Set(custom.filter((p): p is Permission => VALID.has(p)));
  }
  return new Set(defaultPermissionsFor(role));
}

export function can(perms: Set<Permission>, p: Permission): boolean {
  return perms.has(p);
}
