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
  PackageCheck,
} from "lucide-react";
import type { ComponentType } from "react";
import { primaryNavKeys, ALWAYS_PRIMARY } from "@/lib/industries";
import { ALWAYS_ON_MODULES } from "@/lib/modules";

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
        key: "inbound",
        href: "/inbound",
        label: "Inbound (ASN)",
        icon: PackageCheck,
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
 * The workspace-level primary key set: org enabled_modules (from onboarding)
 * when set, else the industry defaults. ALWAYS_ON_MODULES can never be
 * excluded (anti-lockout — enabled_modules is REST-writable by owner/admin,
 * so junk values must not strand a workspace), and unknown keys are ignored.
 */
export function orgPrimaryKeys(
  industry: string | null | undefined,
  orgModules: string[] | null | undefined
): Set<string> {
  if (!orgModules || !Array.isArray(orgModules) || orgModules.length === 0) {
    return new Set(primaryNavKeys(industry));
  }
  const keys = new Set<string>(ALWAYS_ON_MODULES);
  for (const k of orgModules) if (typeof k === "string") keys.add(k);
  return keys;
}

/**
 * Resolve the sidenav for a workspace (no per-user prefs).
 *
 * Keeps the grouped IA (Operate / Flow / Directory / Configure) but shows only
 * the items the workspace flags as primary — org enabled_modules when the
 * onboarding wizard set them, else the industry defaults; everything else
 * collapses into "More" (nothing becomes unreachable — and the command
 * palette always finds all of it). With no industry and no modules set,
 * every item is primary → unchanged nav.
 *
 * Keys that don't map to a built page yet are simply skipped, so roadmap
 * features auto-surface here the moment they ship.
 */
export function resolveNav(
  industry: string | null | undefined,
  orgModules?: string[] | null
): ResolvedNav {
  const primaryKeys = orgPrimaryKeys(industry, orgModules);

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
 * The default per-user prefs for a workspace — visible = the workspace's
 * primary items (org modules, else industry defaults, in order), everything
 * else hidden. Used to seed the Settings UI when a user hasn't customized
 * yet. Filters out not-yet-built keys.
 */
export function defaultNavPrefs(
  industry: string | null | undefined,
  orgModules?: string[] | null
): NavPrefs {
  const existing = new Set(ALL_NAV_ITEMS.map((i) => i.key));
  const primarySet = orgPrimaryKeys(industry, orgModules);
  // Preserve the industry's ordering for keys it names; org-module extras
  // follow in canonical nav order.
  const industryOrder = primaryNavKeys(industry).filter(
    (k) => existing.has(k) && primarySet.has(k)
  );
  const orderedSet = new Set(industryOrder);
  const extras = ALL_NAV_ITEMS.map((i) => i.key).filter(
    (k) => primarySet.has(k) && !orderedSet.has(k)
  );
  const primary = [...industryOrder, ...extras];
  const shown = new Set(primary);
  const rest = ALL_NAV_ITEMS.map((i) => i.key).filter((k) => !shown.has(k));
  return { order: [...primary, ...rest], hidden: rest };
}

/**
 * Resolve the sidenav honoring per-user prefs, falling back to the workspace
 * defaults (org enabled_modules, else industry) when the user hasn't
 * customized. Custom prefs render as a single flat (unlabeled) list in the
 * user's chosen order; hidden items go to "More". New items not yet in the
 * saved order are appended visible so they're never silently lost.
 *
 * Precedence: user nav_prefs > org enabled_modules > industry defaults.
 * A user's explicit prefs win outright — later org module changes don't
 * silently filter a layout the user built by hand (everything stays
 * reachable via "More" and the command palette either way).
 *
 * ALWAYS_PRIMARY (overview, settings) is enforced HERE, not only in the
 * save path — a prefs row hiding "settings" written through any other path
 * must never render a sidenav without Settings.
 */
export function resolveUserNav(
  industry: string | null | undefined,
  prefs: NavPrefs | null | undefined,
  orgModules?: string[] | null
): ResolvedNav {
  if (!prefs || !Array.isArray(prefs.order) || prefs.order.length === 0) {
    return resolveNav(industry, orgModules);
  }
  const byKey = new Map(ALL_NAV_ITEMS.map((i) => [i.key, i]));
  const hidden = new Set(prefs.hidden ?? []);
  for (const locked of ALWAYS_PRIMARY) hidden.delete(locked);

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
