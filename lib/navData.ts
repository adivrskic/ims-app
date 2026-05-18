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
} from "lucide-react";
import type { ComponentType } from "react";

export interface NavItem {
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
      { href: "/", label: "Overview", icon: Activity },
      { href: "/inventory", label: "Inventory", icon: Boxes },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/cycle-counts", label: "Cycle counts", icon: ClipboardCheck },
    ],
  },
  {
    label: "Flow",
    items: [
      { href: "/orders", label: "Orders", icon: ClipboardList },
      { href: "/purchase-orders", label: "Purchase Orders", icon: Truck },
      { href: "/returns", label: "Returns", icon: RotateCcw },
    ],
  },
  {
    label: "Configure",
    items: [
      // Facilities now lives at /facilities (was /settings/facilities).
      // Top-level route so it doesn't inherit the Settings layout chrome.
      { href: "/facilities", label: "Facilities", icon: Building2 },
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
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
