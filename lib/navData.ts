import {
  Activity,
  Boxes,
  BarChart3,
  Building2,
  ClipboardList,
  Truck,
  RotateCcw,
  Plug,
  Settings,
  ClipboardCheck,
  Factory,
  Contact,
  CalendarClock,
  ArrowLeftRight,
  Blocks,
  ScanBarcode,
  Waypoints,
  Hammer,
  ShieldCheck,
  Table2,
} from "lucide-react";
import type { ComponentType } from "react";
import { primaryNavKeys } from "@/lib/industries";

export interface NavItem {
  /** Stable id used by industry nav config + (Phase 2) per-user prefs. */
  key: string;
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  status?: "available" | "soon";
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { key: "overview", href: "/", label: "Overview", icon: Activity },
      { key: "inventory", href: "/inventory", label: "Inventory", icon: Boxes },
      { key: "lots", href: "/lots", label: "Lots", icon: CalendarClock },
      { key: "kits", href: "/kits", label: "Kits", icon: Blocks },
      {
        key: "work-orders",
        href: "/work-orders",
        label: "Work orders",
        icon: Hammer,
      },
      { key: "serials", href: "/serials", label: "Serials", icon: ScanBarcode },
      { key: "analytics", href: "/analytics", label: "Analytics", icon: BarChart3 },
      { key: "reports", href: "/reports", label: "Reports", icon: Table2 },
      {
        key: "cycle-counts",
        href: "/cycle-counts",
        label: "Cycle counts",
        icon: ClipboardCheck,
      },
    ],
  },
  {
    label: "Flow",
    items: [
      { key: "orders", href: "/orders", label: "Orders", icon: ClipboardList },
      { key: "picking", href: "/picking", label: "Picking", icon: Waypoints },
      {
        key: "purchase-orders",
        href: "/purchase-orders",
        label: "Purchase Orders",
        icon: Truck,
      },
      {
        key: "receiving",
        href: "/receiving",
        label: "Receiving QC",
        icon: ShieldCheck,
      },
      {
        key: "transfers",
        href: "/transfers",
        label: "Transfers",
        icon: ArrowLeftRight,
      },
      { key: "returns", href: "/returns", label: "Returns", icon: RotateCcw },
    ],
  },
  {
    label: "Directory",
    items: [
      { key: "suppliers", href: "/suppliers", label: "Suppliers", icon: Factory },
      { key: "customers", href: "/customers", label: "Customers", icon: Contact },
    ],
  },
  {
    label: "Configure",
    items: [
      { key: "facilities", href: "/facilities", label: "Facilities", icon: Building2 },
      { key: "integrations", href: "/integrations", label: "Integrations", icon: Plug },
      { key: "settings", href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

/**
 * Returns the most-specific nav item href matching the current pathname.
 * - "/" matches only when pathname is exactly "/"
 * - "/settings" matches "/settings" AND any "/settings/*" sub-path
 * - "/settings/facilities" would match in preference to "/settings" when both exist
 *
 * Used by SideRail/MobileNav so the parent nav row stays highlighted as
 * the user navigates into its sub-pages (e.g. on /settings/billing the
 * "Settings" nav item highlights; on /facilities/abc/builder the
 * "Facilities" row highlights).
 */
export function findActiveHref(
  items: NavItem[],
  pathname: string
): string | null {
  const matches = items
    .filter((item) => {
      if (item.href === "/") return pathname === "/";
      return pathname === item.href || pathname.startsWith(`${item.href}/`);
    })
    .sort((a, b) => b.href.length - a.href.length);

  return matches[0]?.href ?? null;
}

/** All defined nav items, flattened. */
export const ALL_NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

/** Per-user sidenav customization (Phase 2). Keys reference NavItem.key. */
export interface NavPrefs {
  /** Full ordered list of item keys (the user's preferred order). */
  order: string[];
  /** Keys the user has hidden (moved to "More"). */
  hidden: string[];
}

/** A rendered nav group. `label` is omitted for a user's custom flat list. */
export interface ResolvedGroup {
  label?: string;
  items: NavItem[];
}

export interface ResolvedNav {
  /** Groups to render (industry: labeled; custom prefs: one unlabeled group). */
  groups: ResolvedGroup[];
  /** Available items NOT primary — shown under "More". */
  more: NavItem[];
}

/**
 * Resolve the sidenav for a workspace's industry (no per-user prefs).
 *
 * Keeps the grouped IA (Operate / Flow / Directory / Configure) but shows only
 * the items the industry flags as primary; everything else collapses into
 * "More" (nothing becomes unreachable — and the command palette always finds
 * all of it). With no industry set, every item is primary → unchanged nav.
 *
 * Industry keys that don't map to a built page yet (e.g. "lots") are simply
 * skipped, so roadmap features auto-surface here the moment they ship.
 */
export function resolveNav(industry: string | null | undefined): ResolvedNav {
  const primaryKeys = new Set(primaryNavKeys(industry));

  const groups: ResolvedGroup[] = [];
  const more: NavItem[] = [];

  for (const group of NAV_GROUPS) {
    const primaryItems = group.items.filter((i) => primaryKeys.has(i.key));
    const secondaryItems = group.items.filter((i) => !primaryKeys.has(i.key));
    if (primaryItems.length > 0) {
      groups.push({ label: group.label, items: primaryItems });
    }
    more.push(...secondaryItems);
  }

  return { groups, more };
}

/**
 * The default per-user prefs for an industry — visible = the industry's primary
 * items (in order), everything else hidden. Used to seed the Settings UI when a
 * user hasn't customized yet. Filters out not-yet-built keys.
 */
export function defaultNavPrefs(industry: string | null | undefined): NavPrefs {
  const existing = new Set(ALL_NAV_ITEMS.map((i) => i.key));
  const primary = primaryNavKeys(industry).filter((k) => existing.has(k));
  const primarySet = new Set(primary);
  const rest = ALL_NAV_ITEMS.map((i) => i.key).filter((k) => !primarySet.has(k));
  return { order: [...primary, ...rest], hidden: rest };
}

/**
 * Resolve the sidenav honoring per-user prefs, falling back to industry
 * defaults when the user hasn't customized. Custom prefs render as a single
 * flat (unlabeled) list in the user's chosen order; hidden items go to "More".
 * New items not yet in the saved order are appended visible so they're never
 * silently lost.
 */
export function resolveUserNav(
  industry: string | null | undefined,
  prefs: NavPrefs | null | undefined
): ResolvedNav {
  if (!prefs || !Array.isArray(prefs.order) || prefs.order.length === 0) {
    return resolveNav(industry);
  }
  const byKey = new Map(ALL_NAV_ITEMS.map((i) => [i.key, i]));
  const hidden = new Set(prefs.hidden ?? []);

  const primary: NavItem[] = [];
  const seen = new Set<string>();
  for (const key of prefs.order) {
    const item = byKey.get(key);
    if (item && !hidden.has(key) && !seen.has(key)) {
      primary.push(item);
      seen.add(key);
    }
  }
  // Items missing from saved order (e.g. added in a later release) → append.
  for (const item of ALL_NAV_ITEMS) {
    if (!seen.has(item.key) && !hidden.has(item.key)) {
      primary.push(item);
      seen.add(item.key);
    }
  }

  const more: NavItem[] = [];
  const moreSeen = new Set<string>();
  for (const item of ALL_NAV_ITEMS) {
    if (hidden.has(item.key) && !moreSeen.has(item.key)) {
      more.push(item);
      moreSeen.add(item.key);
    }
  }

  return { groups: [{ items: primary }], more };
}
