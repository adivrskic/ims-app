"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Activity,
  Boxes,
  BarChart3,
  Layers,
  Settings,
  Users,
  KeyRound,
  History,
  Plug,
  ClipboardList,
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
} from "lucide-react";
import { nlSearch } from "@/lib/ai/nlSearch";
import type { NlResult } from "@/lib/ai/nl-types";

interface Action {
  id: string;
  group: string;
  label: string;
  description?: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  href?: string;
  onSelect?: () => void;
}

const ACTIONS: Action[] = [
  {
    id: "overview",
    group: "Navigate",
    label: "Overview",
    description: "Live ops + KPIs",
    icon: Activity,
    href: "/",
  },
  {
    id: "inventory",
    group: "Navigate",
    label: "Inventory",
    description: "Products + locations",
    icon: Boxes,
    href: "/inventory",
  },
  {
    id: "analytics",
    group: "Navigate",
    label: "Analytics",
    description: "Velocity, distribution, action mix",
    icon: BarChart3,
    href: "/analytics",
  },
  {
    id: "cycle-counts",
    group: "Navigate",
    label: "Cycle counts",
    description: "Verify on-hand vs system, surface variance",
    icon: Layers,
    href: "/cycle-counts",
  },
  {
    id: "orders",
    group: "Navigate",
    label: "Orders",
    description: "Pick lists, deliveries, pickups",
    icon: ClipboardList,
    href: "/orders",
  },
  {
    id: "pos",
    group: "Navigate",
    label: "Purchase Orders",
    description: "Inbound from suppliers",
    icon: Truck,
    href: "/purchase-orders",
  },
  {
    id: "customers",
    group: "Navigate",
    label: "Customers",
    description: "People and businesses you sell to",
    icon: Users,
    href: "/customers",
  },
  {
    id: "suppliers",
    group: "Navigate",
    label: "Suppliers",
    description: "Vendor directory + PO scorecards",
    icon: Truck,
    href: "/suppliers",
  },
  {
    id: "facilities",
    group: "Navigate",
    label: "Facilities",
    description: "Warehouses, sections, builder",
    icon: Building2,
    href: "/facilities",
  },
  {
    id: "returns",
    group: "Navigate",
    label: "Returns",
    description: "Restock, damaged, supplier RMA",
    icon: RotateCcw,
    href: "/returns",
  },
  {
    id: "notifications",
    group: "Navigate",
    label: "Notifications",
    description: "Stock alerts, scan summaries, team activity",
    icon: Bell,
    href: "/notifications",
  },
  {
    id: "integrations",
    group: "Navigate",
    label: "Integrations",
    description: "Shopify, QuickBooks, Stripe, more",
    icon: Plug,
    href: "/integrations",
  },

  {
    id: "account",
    group: "Settings",
    label: "Account",
    description: "Profile + workspaces",
    icon: Settings,
    href: "/settings",
  },
  {
    id: "security",
    group: "Settings",
    label: "Security",
    description: "Two-factor authentication, sessions",
    icon: ShieldCheck,
    href: "/settings/security",
  },
  {
    id: "members",
    group: "Settings",
    label: "Team members",
    description: "Invite + manage roles",
    icon: Users,
    href: "/settings/members",
  },
  {
    id: "billing",
    group: "Settings",
    label: "Billing",
    description: "Plan, seats, invoices",
    icon: CreditCard,
    href: "/settings/billing",
  },
  {
    id: "keys",
    group: "Settings",
    label: "API keys",
    description: "Tokens for the mobile app + integrations",
    icon: KeyRound,
    href: "/settings/api-keys",
  },
  {
    id: "audit",
    group: "Settings",
    label: "Audit log",
    description: "Workspace activity history",
    icon: History,
    href: "/settings/audit",
  },
  {
    id: "webhooks",
    group: "Settings",
    label: "Webhooks",
    description: "Outbound event delivery",
    icon: Webhook,
    href: "/settings/webhooks",
  },

  {
    id: "keyboard",
    group: "Help",
    label: "Keyboard shortcuts",
    description: "Show all shortcuts",
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
        a.group.toLowerCase().includes(q)
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
