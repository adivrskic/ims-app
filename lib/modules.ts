/**
 * Onboarding module registry.
 *
 * The wizard never shows customers raw nav keys. Instead it asks plain-language
 * questions ("We receive stock from suppliers") — each activity maps to the set
 * of nav keys (lib/navData.ts) it turns on. The union of selected activities
 * plus ALWAYS_ON_MODULES becomes `orgs.enabled_modules`, which drives:
 *
 *   - the sidenav (org layer between industry defaults and per-user prefs)
 *   - the overview dashboard's visible widgets (lib/dashboardWidgets.ts)
 *   - the getting-started checklist composition
 *
 * `orgs.enabled_modules = null` means "everything on" — existing workspaces
 * keep today's exact behavior. Unknown keys written via direct PostgREST are
 * tolerated by every resolver (skipped, never thrown).
 *
 * Pure data — no React, no server-only — safe to import from client
 * components (the wizard's live behavior) and node tests alike.
 */

// Nav keys that are never a choice: hiding them could strand a workspace
// (overview/settings/inventory) or hide read-only insight everyone benefits
// from (analytics/reports). Enforced at resolve time, not just at write time.
export const ALWAYS_ON_MODULES = [
  "overview",
  "inventory",
  "analytics",
  "reports",
  "facilities",
  "settings",
] as const;

// ── Activities ("How you work") ───────────────────────────────────────────

export const ACTIVITY_KEYS = [
  "receive-stock",
  "ship-orders",
  "track-lots",
  "track-serials",
  "build-kits",
  "move-stock",
  "take-returns",
  "count-stock",
  "sell-online",
] as const;

export type ActivityKey = (typeof ACTIVITY_KEYS)[number];

export interface ActivityDef {
  key: ActivityKey;
  /** Plain-language statement shown as the chip label. */
  label: string;
  /** One-line consequence, shown as supporting copy. */
  desc: string;
  /** Nav keys (lib/navData.ts) this activity turns on. */
  navKeys: string[];
}

export const ACTIVITIES: ActivityDef[] = [
  {
    key: "receive-stock",
    label: "We receive stock from suppliers",
    desc: "Purchase orders, inbound shipments, receiving QC",
    navKeys: ["purchase-orders", "inbound", "receiving", "suppliers"],
  },
  {
    key: "ship-orders",
    label: "We ship or hand off customer orders",
    desc: "Orders, pick lists, customers",
    navKeys: ["orders", "picking", "customers"],
  },
  {
    key: "track-lots",
    label: "We track lot numbers or expiry dates",
    desc: "Lot/batch tracking with FEFO",
    navKeys: ["lots"],
  },
  {
    key: "track-serials",
    label: "We track serial numbers",
    desc: "Unit-level serial tracking",
    navKeys: ["serials"],
  },
  {
    key: "build-kits",
    label: "We build kits or assemble products",
    desc: "Kits, bills of materials, work orders",
    navKeys: ["kits", "work-orders"],
  },
  {
    key: "move-stock",
    label: "We move stock between locations",
    desc: "Site-to-site transfers",
    navKeys: ["transfers"],
  },
  {
    key: "take-returns",
    label: "We take returns",
    desc: "Customer returns and restocking",
    navKeys: ["returns"],
  },
  {
    key: "count-stock",
    label: "We do regular stock counts",
    desc: "Cycle counts and audits",
    navKeys: ["cycle-counts"],
  },
  {
    key: "sell-online",
    label: "We sell through online stores",
    desc: "Shopify, ShipStation, QuickBooks and more",
    navKeys: ["integrations"],
  },
];

export function isActivityKey(v: unknown): v is ActivityKey {
  return typeof v === "string" && ACTIVITY_KEYS.includes(v as ActivityKey);
}

/**
 * Which activities an industry's default nav implies — used to pre-check the
 * wizard's chips so accepting the defaults is a single click of "Next".
 * An activity is pre-checked when ANY of its nav keys is in the industry's
 * primary nav (works for null industry via DEFAULT_PRIMARY_NAV too).
 */
export function defaultActivities(primaryNav: string[]): ActivityKey[] {
  const nav = new Set(primaryNav);
  return ACTIVITIES.filter((a) => a.navKeys.some((k) => nav.has(k))).map(
    (a) => a.key
  );
}

/**
 * Selected activities → the org's enabled module list (nav keys).
 * Always includes ALWAYS_ON_MODULES; unknown activity keys are skipped.
 */
export function modulesFromActivities(activities: string[]): string[] {
  const out = new Set<string>(ALWAYS_ON_MODULES);
  for (const key of activities) {
    const def = ACTIVITIES.find((a) => a.key === key);
    if (def) for (const nav of def.navKeys) out.add(nav);
  }
  return Array.from(out);
}

/**
 * Reverse-derive checked activities from a stored enabled_modules list (for
 * the Settings editor). Activities' nav-key sets are disjoint, so ANY-match
 * is exact. null modules = everything on = every activity checked.
 */
export function activitiesFromModules(
  modules: string[] | null | undefined
): ActivityKey[] {
  if (!modules) return ACTIVITIES.map((a) => a.key);
  const set = new Set(modules);
  return ACTIVITIES.filter((a) => a.navKeys.some((k) => set.has(k))).map(
    (a) => a.key
  );
}

// ── Priorities ("What do you want to see first?") ─────────────────────────

export const MAX_PRIORITIES = 3;

export const PRIORITY_KEYS = [
  "never-run-out",
  "ship-faster",
  "inbound-visibility",
  "cash-in-stock",
  "team-activity",
] as const;

export type PriorityKey = (typeof PRIORITY_KEYS)[number];

export interface PriorityDef {
  key: PriorityKey;
  label: string;
  /** Widget keys (lib/dashboardWidgets.ts) hoisted to the top for this pick. */
  boosts: string[];
}

export const PRIORITIES: PriorityDef[] = [
  {
    key: "never-run-out",
    label: "Never run out of stock",
    boosts: ["kpi.low_stock", "section.reorder_alerts"],
  },
  {
    key: "ship-faster",
    label: "Ship orders faster",
    boosts: ["kpi.open_orders", "kpi.pick_queue", "section.pick_queue"],
  },
  {
    key: "inbound-visibility",
    label: "Know what's arriving",
    boosts: ["kpi.pos_in_transit", "section.pos_in_transit"],
  },
  {
    key: "cash-in-stock",
    label: "Cash tied up in stock",
    boosts: ["kpi.inventory_value", "kpi.dead_stock"],
  },
  {
    key: "team-activity",
    label: "What my team did today",
    boosts: ["kpi.scans_today", "section.recent_scans", "section.top_movers"],
  },
];

export function isPriorityKey(v: unknown): v is PriorityKey {
  return typeof v === "string" && PRIORITY_KEYS.includes(v as PriorityKey);
}

/** Validate + cap a raw priorities list (order-preserving, deduped). */
export function normalizePriorities(raw: string[]): PriorityKey[] {
  const seen = new Set<string>();
  const out: PriorityKey[] = [];
  for (const p of raw) {
    if (isPriorityKey(p) && !seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
    if (out.length >= MAX_PRIORITIES) break;
  }
  return out;
}

// ── Operation size ────────────────────────────────────────────────────────

export const SIZE_CLASSES = ["single_room", "single_site", "multi_site"] as const;

export type SizeClass = (typeof SIZE_CLASSES)[number];

export interface SizeClassDef {
  key: SizeClass;
  label: string;
  desc: string;
}

export const SIZE_CLASS_DEFS: SizeClassDef[] = [
  {
    key: "single_room",
    label: "A single room or storage area",
    desc: "The essentials only — a lean dashboard",
  },
  {
    key: "single_site",
    label: "One warehouse",
    desc: "The standard setup",
  },
  {
    key: "multi_site",
    label: "Several locations",
    desc: "Multi-facility from day one",
  },
];

export function isSizeClass(v: unknown): v is SizeClass {
  return typeof v === "string" && SIZE_CLASSES.includes(v as SizeClass);
}

/** Max length for workspace / facility names (orgs.name is varchar(255)). */
export const MAX_NAME_LENGTH = 120;

/** Max teammate invites accepted per provisioning submit (server-enforced). */
export const MAX_INVITES = 20;

// Shared email shape — used by the wizard's client-side chip validation and
// by lib/workspace/helpers.ts parseEmails, so client and server agree.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
