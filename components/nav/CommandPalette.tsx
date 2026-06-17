"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Activity,
  Boxes,
  BarChart3,
  Settings,
  Users,
  KeyRound,
  History,
  Plug,
  ClipboardList,
  ClipboardCheck,
  Truck,
  Webhook,
  RotateCcw,
  CreditCard,
  Building2,
  ShieldCheck,
  Keyboard,
  Bell,
  ArrowRight,
  Sparkles,
  Loader2,
  CalendarClock,
  Blocks,
  Hammer,
  ScanBarcode,
  Table2,
  Waypoints,
  PackageCheck,
  PackageMinus,
  PackageX,
  ArrowLeftRight,
  Factory,
  Contact,
  Smartphone,
  SlidersHorizontal,
  QrCode,
  Plus,
  Upload,
  TrendingUp,
  Map as MapIcon,
  DollarSign,
} from "lucide-react";
import { nlSearch } from "@/lib/ai/nlSearch";
import type { NlResult } from "@/lib/ai/nl-types";

interface Action {
  id: string;
  group: string;
  label: string;
  description?: string;
  /** Extra search aliases (acronyms, synonyms) that don't appear in the label. */
  keywords?: string[];
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  href?: string;
  onSelect?: () => void;
}

const ACTIONS: Action[] = [
  // ─── Operate ────────────────────────────────────────────────────────────
  {
    id: "overview",
    group: "Operate",
    label: "Overview",
    description: "Live ops + KPIs",
    keywords: ["home", "dashboard", "kpi"],
    icon: Activity,
    href: "/",
  },
  {
    id: "inventory",
    group: "Operate",
    label: "Inventory",
    description: "Products + on-hand by location",
    keywords: ["stock", "sku", "products", "items", "on hand"],
    icon: Boxes,
    href: "/inventory",
  },
  {
    id: "lots",
    group: "Operate",
    label: "Lots",
    description: "Batches, expiry, FEFO tracking",
    keywords: ["batch", "expiry", "expiration", "fefo", "shelf life"],
    icon: CalendarClock,
    href: "/lots",
  },
  {
    id: "kits",
    group: "Operate",
    label: "Kits",
    description: "Bundles + bill of materials",
    keywords: ["bom", "bundle", "assembly", "bill of materials"],
    icon: Blocks,
    href: "/kits",
  },
  {
    id: "work-orders",
    group: "Operate",
    label: "Work orders",
    description: "Builds, assembly, manufacturing",
    keywords: ["wo", "build", "assemble", "manufacture", "production"],
    icon: Hammer,
    href: "/work-orders",
  },
  {
    id: "serials",
    group: "Operate",
    label: "Serials",
    description: "Serial-number tracked units",
    keywords: ["serial number", "sn", "imei", "tracked"],
    icon: ScanBarcode,
    href: "/serials",
  },
  {
    id: "analytics",
    group: "Operate",
    label: "Analytics",
    description: "Velocity, distribution, action mix",
    keywords: ["metrics", "kpi", "charts", "velocity"],
    icon: BarChart3,
    href: "/analytics",
  },
  {
    id: "reports",
    group: "Operate",
    label: "Reports",
    description: "Custom report builder + exports",
    keywords: ["custom report", "export", "csv", "query"],
    icon: Table2,
    href: "/reports",
  },
  {
    id: "cycle-counts",
    group: "Operate",
    label: "Cycle counts",
    description: "Verify on-hand vs system, surface variance",
    keywords: ["count", "variance", "stocktake", "audit count"],
    icon: ClipboardCheck,
    href: "/cycle-counts",
  },

  // ─── Flow ───────────────────────────────────────────────────────────────
  {
    id: "orders",
    group: "Flow",
    label: "Orders",
    description: "Pick lists, deliveries, pickups",
    keywords: ["sales order", "so", "fulfillment", "shipments"],
    icon: ClipboardList,
    href: "/orders",
  },
  {
    id: "backorders",
    group: "Flow",
    label: "Backorders",
    description: "Unfulfilled demand awaiting stock",
    keywords: ["oversold", "unfulfilled", "shortage", "out of stock"],
    icon: PackageMinus,
    href: "/orders/backorders",
  },
  {
    id: "picking",
    group: "Flow",
    label: "Picking",
    description: "Waves, zones, pick paths",
    keywords: ["wave", "pick list", "pick path", "zone", "batch pick"],
    icon: Waypoints,
    href: "/picking",
  },
  {
    id: "pos",
    group: "Flow",
    label: "Purchase Orders",
    description: "Inbound from suppliers",
    keywords: ["po", "procurement", "buy", "replenish", "reorder"],
    icon: Truck,
    href: "/purchase-orders",
  },
  {
    id: "inbound",
    group: "Flow",
    label: "Inbound (ASN)",
    description: "Advance ship notices + LPN receiving",
    keywords: ["asn", "advance ship notice", "lpn", "pallet", "delivery"],
    icon: PackageCheck,
    href: "/inbound",
  },
  {
    id: "receiving",
    group: "Flow",
    label: "Receiving QC",
    description: "Inspect, accept, quarantine arrivals",
    keywords: ["qc", "quality", "inspection", "quarantine", "putaway"],
    icon: ShieldCheck,
    href: "/receiving",
  },
  {
    id: "transfers",
    group: "Flow",
    label: "Transfers",
    description: "Move stock between facilities",
    keywords: ["move", "relocate", "interbranch", "transfer order"],
    icon: ArrowLeftRight,
    href: "/transfers",
  },
  {
    id: "returns",
    group: "Flow",
    label: "Returns",
    description: "Restock, damaged, supplier RMA",
    keywords: ["rma", "refund", "damaged", "reverse logistics"],
    icon: RotateCcw,
    href: "/returns",
  },

  // ─── Directory ──────────────────────────────────────────────────────────
  {
    id: "suppliers",
    group: "Directory",
    label: "Suppliers",
    description: "Vendor directory + PO scorecards",
    keywords: ["vendors", "scorecard", "supplier"],
    icon: Factory,
    href: "/suppliers",
  },
  {
    id: "customers",
    group: "Directory",
    label: "Customers",
    description: "People and businesses you sell to",
    keywords: ["clients", "buyers", "accounts"],
    icon: Contact,
    href: "/customers",
  },

  // ─── Analyze ────────────────────────────────────────────────────────────
  {
    id: "forecast",
    group: "Analyze",
    label: "Demand forecast",
    description: "Projected demand + seasonality",
    keywords: ["forecast", "prediction", "seasonality", "demand planning"],
    icon: TrendingUp,
    href: "/analytics/forecast",
  },
  {
    id: "dead-stock",
    group: "Analyze",
    label: "Dead stock",
    description: "Slow-moving + aging inventory",
    keywords: ["aging", "slow moving", "obsolete", "stale", "non-moving"],
    icon: PackageX,
    href: "/analytics/dead-stock",
  },
  {
    id: "slotting",
    group: "Analyze",
    label: "Slotting health",
    description: "Placement optimization + ABC",
    keywords: ["placement", "optimization", "abc", "bin", "location strategy"],
    icon: MapIcon,
    href: "/analytics/slotting",
  },
  {
    id: "valuation",
    group: "Analyze",
    label: "Inventory valuation",
    description: "Stock value + cost basis",
    keywords: ["valuation", "cogs", "value", "worth", "cost", "asset"],
    icon: DollarSign,
    href: "/analytics/valuation",
  },

  // ─── Create ─────────────────────────────────────────────────────────────
  {
    id: "new-order",
    group: "Create",
    label: "New order",
    description: "Draft a sales order",
    keywords: ["create order", "add order", "sell"],
    icon: Plus,
    href: "/orders/new",
  },
  {
    id: "new-po",
    group: "Create",
    label: "New purchase order",
    description: "Raise a PO to a supplier",
    keywords: ["create po", "add po", "procure", "reorder"],
    icon: Plus,
    href: "/purchase-orders/new",
  },
  {
    id: "new-inbound",
    group: "Create",
    label: "New inbound (ASN)",
    description: "Log an advance ship notice",
    keywords: ["create asn", "add asn", "expect delivery"],
    icon: Plus,
    href: "/inbound/new",
  },
  {
    id: "new-customer",
    group: "Create",
    label: "New customer",
    description: "Add a customer record",
    keywords: ["create customer", "add client"],
    icon: Plus,
    href: "/customers/new",
  },
  {
    id: "new-supplier",
    group: "Create",
    label: "New supplier",
    description: "Add a vendor record",
    keywords: ["create supplier", "add vendor"],
    icon: Plus,
    href: "/suppliers/new",
  },
  {
    id: "import-inventory",
    group: "Create",
    label: "Import inventory",
    description: "Bulk-load products from CSV",
    keywords: ["csv", "upload", "bulk", "import products"],
    icon: Upload,
    href: "/inventory/import",
  },
  {
    id: "scan",
    group: "Create",
    label: "Scan & locate",
    description: "Look up a barcode or location",
    keywords: ["barcode", "lookup", "find", "qr"],
    icon: QrCode,
    href: "/scan",
  },

  // ─── Configure ──────────────────────────────────────────────────────────
  {
    id: "facilities",
    group: "Configure",
    label: "Facilities",
    description: "Warehouses, sections, floor builder",
    keywords: ["warehouse", "sections", "builder", "floor", "map", "racks"],
    icon: Building2,
    href: "/facilities",
  },
  {
    id: "integrations",
    group: "Configure",
    label: "Integrations",
    description: "Shopify, QuickBooks, Stripe, Resend, more",
    keywords: [
      "shopify",
      "quickbooks",
      "stripe",
      "resend",
      "connect",
      "channels",
    ],
    icon: Plug,
    href: "/integrations",
  },
  {
    id: "notifications",
    group: "Configure",
    label: "Notifications",
    description: "Stock alerts, scan summaries, team activity",
    keywords: ["alerts", "notify"],
    icon: Bell,
    href: "/notifications",
  },

  // ─── Settings ───────────────────────────────────────────────────────────
  {
    id: "account",
    group: "Settings",
    label: "Account",
    description: "Profile + workspaces",
    keywords: ["profile", "workspace"],
    icon: Settings,
    href: "/settings",
  },
  {
    id: "navigation",
    group: "Settings",
    label: "Navigation",
    description: "Customize your sidebar + industry",
    keywords: ["sidebar", "sidenav", "menu", "industry"],
    icon: SlidersHorizontal,
    href: "/settings/navigation",
  },
  {
    id: "security",
    group: "Settings",
    label: "Security",
    description: "Two-factor authentication, sessions",
    keywords: ["2fa", "mfa", "password", "sessions", "auth"],
    icon: ShieldCheck,
    href: "/settings/security",
  },
  {
    id: "members",
    group: "Settings",
    label: "Team members",
    description: "Invite + manage roles",
    keywords: ["team", "roles", "invite", "rbac", "permissions", "users"],
    icon: Users,
    href: "/settings/members",
  },
  {
    id: "devices",
    group: "Settings",
    label: "Connected devices",
    description: "Scanners, printers + hardware",
    keywords: ["hardware", "scanner", "printer", "kiosk"],
    icon: Smartphone,
    href: "/settings/devices",
  },
  {
    id: "billing",
    group: "Settings",
    label: "Billing",
    description: "Plan, seats, invoices",
    keywords: ["plan", "seats", "invoices", "subscription", "payment"],
    icon: CreditCard,
    href: "/settings/billing",
  },
  {
    id: "keys",
    group: "Settings",
    label: "API keys",
    description: "Tokens for the mobile app + integrations",
    keywords: ["token", "api", "key"],
    icon: KeyRound,
    href: "/settings/api-keys",
  },
  {
    id: "adjustments",
    group: "Settings",
    label: "Adjustments",
    description: "Reason codes + approval thresholds",
    keywords: ["reasons", "approval", "threshold", "shrinkage"],
    icon: SlidersHorizontal,
    href: "/settings/adjustments",
  },
  {
    id: "audit",
    group: "Settings",
    label: "Audit log",
    description: "Workspace activity history",
    keywords: ["activity", "history", "log", "trail"],
    icon: History,
    href: "/settings/audit",
  },
  {
    id: "webhooks",
    group: "Settings",
    label: "Webhooks",
    description: "Outbound event delivery",
    keywords: ["events", "outbound", "callback"],
    icon: Webhook,
    href: "/integrations/webhooks",
  },

  // ─── Help ───────────────────────────────────────────────────────────────
  {
    id: "keyboard",
    group: "Help",
    label: "Keyboard shortcuts",
    description: "Show all shortcuts",
    keywords: ["shortcuts", "hotkeys", "keys"],
    icon: Keyboard,
    onSelect: () => {
      window.dispatchEvent(new Event("open-keyboard-shortcuts"));
    },
  },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  // NL search tier — only engages when command matching finds nothing.
  const [nlResults, setNlResults] = useState<NlResult[] | null>(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlInterpreted, setNlInterpreted] = useState("");
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  // ⌘K / Ctrl+K + custom event from search bar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("open-command-palette", onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("open-command-palette", onCustom);
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      setNlResults(null);
      setNlInterpreted("");
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ACTIONS;
    return ACTIONS.filter(
      (a) =>
        a.label.toLowerCase().includes(q) ||
        a.description?.toLowerCase().includes(q) ||
        a.group.toLowerCase().includes(q) ||
        a.keywords?.some((k) => k.includes(q))
    );
  }, [query]);

  // Reset active when filtered list changes
  useEffect(() => {
    setActive(0);
  }, [query]);

  // NL fallback: debounced, fires only when the fast command tier matched
  // nothing and the query looks like a real search. Fail-open — on any error
  // we leave nlResults empty and the normal "no matches" copy shows.
  useEffect(() => {
    const q = query.trim();
    if (filtered.length > 0 || q.length < 3) {
      setNlResults(null);
      setNlLoading(false);
      setNlInterpreted("");
      return;
    }
    let cancelled = false;
    setNlLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await nlSearch(q);
        if (cancelled) return;
        setNlResults(res?.results ?? []);
        setNlInterpreted(res?.interpreted ?? "");
      } catch {
        if (!cancelled) {
          setNlResults([]);
          setNlInterpreted("");
        }
      } finally {
        if (!cancelled) setNlLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, filtered.length]);

  const groups = useMemo(() => {
    const out: Array<{ name: string; items: Action[] }> = [];
    const seen = new Map<string, Action[]>();
    for (const a of filtered) {
      if (!seen.has(a.group)) {
        const arr: Action[] = [];
        seen.set(a.group, arr);
        out.push({ name: a.group, items: arr });
      }
      seen.get(a.group)!.push(a);
    }
    return out;
  }, [filtered]);

  const nlActions = useMemo<Action[]>(
    () =>
      (nlResults ?? []).map((r) => ({
        id: `nl-${r.id}`,
        group: "Results",
        label: r.label,
        description: r.sublabel,
        icon: Boxes,
        href: r.href,
      })),
    [nlResults]
  );

  const handleSelect = (a: Action) => {
    setOpen(false);
    if (a.onSelect) {
      a.onSelect();
    } else if (a.href) {
      router.push(a.href);
    }
  };

  const commandMode = filtered.length > 0;
  const navList: Action[] = commandMode ? filtered : nlActions;
  const displayGroups = commandMode
    ? groups
    : nlActions.length > 0
    ? [{ name: "Results", items: nlActions }]
    : [];

  const q = query.trim();
  const nlActive = !commandMode && q.length >= 3;
  const nlPending = nlActive && (nlLoading || nlResults === null);
  const nlEmpty =
    nlActive && !nlLoading && nlResults !== null && nlActions.length === 0;

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(navList.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const a = navList[active];
      if (a) handleSelect(a);
    }
  };

  if (!open) return null;

  // Compute a flat index for highlighting per group
  let flatIndex = -1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      className="fixed inset-0 flex items-start justify-center px-16 pt-[12vh]"
      style={{
        zIndex: 200,
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-[600px] hairline bg-[var(--surface)] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hairline-b flex items-center gap-10 px-14 py-12">
          <Search
            size={14}
            strokeWidth={1.5}
            className="text-text-dim shrink-0"
          />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Search pages, settings, or ask in plain English…"
            className="flex-1 bg-transparent border-0 outline-none text-text placeholder:text-text-dim"
            style={{ fontFamily: "var(--mono)", fontSize: 13 }}
            aria-label="Search commands"
          />
          <kbd
            className="shrink-0 hairline-subtle px-6 py-2 text-text-dim"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 9,
              letterSpacing: "1px",
            }}
          >
            ESC
          </kbd>
        </div>

        <div
          className="overflow-y-auto"
          style={{ maxHeight: "min(60vh, 480px)" }}
        >
          {commandMode || nlActions.length > 0 ? (
            <>
              {nlActive && nlInterpreted && (
                <p className="px-14 pt-12 pb-6 label-text text-text-muted flex items-center gap-6">
                  <Sparkles
                    size={10}
                    strokeWidth={1.5}
                    className="text-[var(--accent)]"
                    aria-hidden
                  />
                  Interpreted · {nlInterpreted}
                </p>
              )}
              {displayGroups.map((g) => (
                <div key={g.name}>
                  <p className="px-14 pt-12 pb-6 label-text text-text-muted">
                    {g.name}
                  </p>
                  <ul>
                    {g.items.map((a) => {
                      flatIndex++;
                      const isActive = flatIndex === active;
                      const Icon = a.icon;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onMouseEnter={() => setActive(flatIndex)}
                            onClick={() => handleSelect(a)}
                            className={`w-full flex items-center gap-12 px-14 py-10 text-left transition-colors ${
                              isActive
                                ? "bg-[var(--accent-dim)] text-[var(--accent)]"
                                : "hover:bg-[var(--surface-2)] text-text-secondary"
                            }`}
                          >
                            <Icon size={14} strokeWidth={1.5} />
                            <div className="flex-1 min-w-0">
                              <p
                                className={
                                  isActive
                                    ? "text-[var(--accent)]"
                                    : "text-text"
                                }
                                style={{
                                  fontFamily: "var(--display)",
                                  fontSize: 13,
                                  fontWeight: 500,
                                }}
                              >
                                {a.label}
                              </p>
                              {a.description && (
                                <p
                                  className="mono-sm text-text-muted truncate"
                                  style={{ fontSize: 11 }}
                                >
                                  {a.description}
                                </p>
                              )}
                            </div>
                            {isActive && (
                              <ArrowRight size={12} strokeWidth={1.5} />
                            )}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </>
          ) : nlPending ? (
            <div className="px-14 py-32 flex items-center justify-center gap-10 text-text-muted">
              <Loader2 size={14} strokeWidth={1.5} className="animate-spin" />
              <p className="mono-sm">Searching…</p>
            </div>
          ) : nlEmpty ? (
            <div className="px-14 py-32 text-center">
              <p className="mono-sm text-text-muted">
                No results for &ldquo;{query}&rdquo;
              </p>
            </div>
          ) : (
            <div className="px-14 py-32 text-center">
              <p className="mono-sm text-text-muted">
                No matches for &ldquo;{query}&rdquo;
              </p>
            </div>
          )}
        </div>

        <footer className="hairline-t px-14 py-8 flex items-center justify-between">
          <p className="label-text text-text-dim">
            <kbd style={{ fontFamily: "var(--mono)", fontSize: 9 }}>↑↓</kbd>{" "}
            navigate &nbsp;·&nbsp;{" "}
            <kbd style={{ fontFamily: "var(--mono)", fontSize: 9 }}>↵</kbd>{" "}
            select
          </p>
          <p className="label-text text-text-dim">
            {navList.length} result{navList.length === 1 ? "" : "s"}
          </p>
        </footer>
      </div>
    </div>
  );
}
