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
      { key: "analytics", href: "/analytics", label: "Analytics", icon: BarChart3 },
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
      {
        key: "purchase-orders",
        href: "/purchase-orders",
        label: "Purchase Orders",
        icon: Truck,
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

export interface ResolvedNav {
  /** Groups filtered to the industry's primary items (empty groups dropped). */
  groups: NavGroup[];
  /** Available items NOT primary for this industry — shown under "More". */
  more: NavItem[];
}

/**
 * Resolve the sidenav for a workspace's industry.
 *
 * Keeps the grouped IA (Operate / Flow / Directory / Configure) but shows only
 * the items the industry flags as primary; everything else collapses into
 * "More" (nothing becomes unreachable — and the command palette always finds
 * all of it). With no industry set, every item is primary → unchanged nav.
 *
 * Industry keys that don't map to a built page yet (e.g. "lots") are simply
 * skipped, so roadmap features auto-surface here the moment they ship.
 *
 * (Phase 2 will layer per-user show/hide + reorder on top of this.)
 */
export function resolveNav(industry: string | null | undefined): ResolvedNav {
  const primaryKeys = new Set(primaryNavKeys(industry));

  const groups: NavGroup[] = [];
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
