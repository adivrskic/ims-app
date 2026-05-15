import {
  Activity,
  Boxes,
  BarChart3,
  ClipboardList,
  Truck,
  RotateCcw,
  Plug,
  Settings,
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
      { href: "/integrations", label: "Integrations", icon: Plug },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
