/**
 * Overview-dashboard widget registry + resolver.
 *
 * Mirrors lib/industries.ts: pure data + a pure resolver, so the same code
 * runs on the server (app/(app)/page.tsx), in a client preview, and in node
 * tests with no mocking.
 *
 * The three role layouts that used to be hard-coded JSX in page.tsx are
 * expressed here as ordered block arrays. resolveDashboard() then:
 *
 *   1. filters widgets whose required module isn't in orgs.enabled_modules
 *      (null modules = everything on — existing orgs keep today's layout
 *      EXACTLY; pinned by test/dashboardResolve.test.ts)
 *   2. optionally trims catalog-shape widgets for single-room operations
 *   3. hoists the widgets matching the org's picked priorities
 *
 * Section numerals are NOT stored here — the page computes them from the
 * resolved render order, which fixes the old day-0 numbering gaps.
 */

import { PRIORITIES } from "@/lib/modules";

// ── Widget keys ───────────────────────────────────────────────────────────

export const KPI_KEYS = [
  "kpi.scans_today",
  "kpi.open_orders",
  "kpi.pick_queue",
  "kpi.pos_in_transit",
  "kpi.low_stock",
  "kpi.units_on_hand",
  "kpi.products",
  "kpi.sections",
  "kpi.inventory_value",
  "kpi.dead_stock",
] as const;

export const SECTION_KEYS = [
  "section.getting_started",
  "section.reorder_alerts",
  "section.pick_queue",
  "section.pos_in_transit",
  "section.top_movers",
  "section.recent_scans",
  "section.quick_jump",
] as const;

export type KpiKey = (typeof KPI_KEYS)[number];
export type SectionKey = (typeof SECTION_KEYS)[number];
export type WidgetKey = KpiKey | SectionKey;

export type DashboardRole = "owner" | "admin" | "member";

/**
 * Module gates: widget → the nav-key module that must be enabled for it to
 * render. Widgets absent here are always shown. section.reorder_alerts is
 * gated on purchasing because it is a reorder worklist with a Draft-PO
 * action — the always-on kpi.low_stock keeps the signal for everyone else.
 */
export const WIDGET_MODULE_GATES: Partial<Record<WidgetKey, string>> = {
  "kpi.open_orders": "orders",
  "kpi.pick_queue": "orders",
  "section.pick_queue": "orders",
  "kpi.pos_in_transit": "purchase-orders",
  "section.pos_in_transit": "purchase-orders",
  "section.reorder_alerts": "purchase-orders",
};

/** Widgets trimmed for single-room operations (still on /analytics). */
const COMPACT_TRIMMED: WidgetKey[] = [
  "kpi.products",
  "kpi.sections",
  "section.top_movers",
];

// ── Quick-jump cards ──────────────────────────────────────────────────────

export const CARD_KEYS = [
  "inventory",
  "orders",
  "analytics",
  "facilities",
  "integrations",
] as const;

export type CardKey = (typeof CARD_KEYS)[number];

/** Card → module gate (ungated cards always show). */
const CARD_MODULE_GATES: Partial<Record<CardKey, string>> = {
  orders: "orders",
  integrations: "integrations",
};

// ── Blocks ────────────────────────────────────────────────────────────────

export interface KpiBlockTitle {
  eyebrow: string;
  title: string;
}

export type DashboardBlock =
  | {
      kind: "kpis";
      id: string;
      /** Visible SectionTitle header (numbered) — or srTitle for an sr-only heading. */
      title?: KpiBlockTitle;
      srTitle?: string;
      kpis: KpiKey[];
    }
  | { kind: "section"; key: Exclude<SectionKey, "section.quick_jump"> }
  | {
      kind: "columns";
      keys: [
        Exclude<SectionKey, "section.quick_jump" | "section.getting_started">,
        Exclude<SectionKey, "section.quick_jump" | "section.getting_started">
      ];
    }
  | { kind: "quick_jump"; cards: CardKey[] };

/**
 * Per-role default layouts — byte-for-byte the pre-registry page.tsx
 * composition, with section.getting_started prepended (the page renders it
 * only for young workspaces, so established orgs see no change).
 */
const ROLE_LAYOUTS: Record<DashboardRole, DashboardBlock[]> = {
  member: [
    { kind: "section", key: "section.getting_started" },
    {
      kind: "kpis",
      id: "member-today",
      srTitle: "Today",
      kpis: [
        "kpi.scans_today",
        "kpi.open_orders",
        "kpi.pick_queue",
        "kpi.low_stock",
      ],
    },
    { kind: "section", key: "section.reorder_alerts" },
    { kind: "section", key: "section.pick_queue" },
    { kind: "section", key: "section.recent_scans" },
    { kind: "quick_jump", cards: ["inventory", "orders", "facilities"] },
  ],
  admin: [
    { kind: "section", key: "section.getting_started" },
    {
      kind: "kpis",
      id: "admin-flow",
      title: { eyebrow: "Order flow", title: "In motion" },
      kpis: [
        "kpi.open_orders",
        "kpi.pick_queue",
        "kpi.pos_in_transit",
        "kpi.low_stock",
      ],
    },
    {
      kind: "kpis",
      id: "admin-inventory",
      title: { eyebrow: "Inventory", title: "On hand" },
      kpis: [
        "kpi.scans_today",
        "kpi.units_on_hand",
        "kpi.products",
        "kpi.sections",
      ],
    },
    { kind: "section", key: "section.reorder_alerts" },
    { kind: "columns", keys: ["section.pick_queue", "section.pos_in_transit"] },
    { kind: "section", key: "section.top_movers" },
    { kind: "section", key: "section.recent_scans" },
    {
      kind: "quick_jump",
      cards: ["inventory", "orders", "analytics", "facilities", "integrations"],
    },
  ],
  owner: [
    { kind: "section", key: "section.getting_started" },
    {
      kind: "kpis",
      id: "owner-headline",
      srTitle: "Headline",
      kpis: [
        "kpi.scans_today",
        "kpi.units_on_hand",
        "kpi.open_orders",
        "kpi.low_stock",
        "kpi.inventory_value",
        "kpi.dead_stock",
      ],
    },
    { kind: "section", key: "section.top_movers" },
    { kind: "columns", keys: ["section.pick_queue", "section.pos_in_transit"] },
    { kind: "section", key: "section.reorder_alerts" },
    {
      kind: "quick_jump",
      cards: ["analytics", "inventory", "orders", "facilities", "integrations"],
    },
  ],
};

// ── Resolver ──────────────────────────────────────────────────────────────

function widgetEnabled(
  key: WidgetKey,
  modules: ReadonlySet<string> | null
): boolean {
  if (!modules) return true; // null = everything on
  const gate = WIDGET_MODULE_GATES[key];
  return !gate || modules.has(gate);
}

/** Rank of a widget under the org's picked priorities (lower = hoist first). */
function boostRank(keys: WidgetKey[], priorities: string[]): number {
  let best = Number.POSITIVE_INFINITY;
  priorities.forEach((p, i) => {
    const def = PRIORITIES.find((d) => d.key === p);
    if (def && i < best && keys.some((k) => def.boosts.includes(k))) {
      best = i;
    }
  });
  return best;
}

/** Stable sort — keeps original order among equal ranks. */
function stableSortBy<T>(items: T[], rank: (item: T) => number): T[] {
  return items
    .map((item, i) => ({ item, i, r: rank(item) }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.item);
}

/**
 * Resolve the ordered dashboard blocks for a role + the org's onboarding
 * choices. All inputs tolerate junk (unknown module/priority strings are
 * skipped) because orgs columns are REST-writable by owners/admins.
 *
 * `compact` = single-room operation → trims catalog-shape widgets.
 */
export function resolveDashboard(
  role: DashboardRole,
  enabledModules: string[] | null | undefined,
  priorities: string[] | null | undefined,
  opts: { compact?: boolean } = {}
): DashboardBlock[] {
  const modules = enabledModules ? new Set(enabledModules) : null;
  const picks = (priorities ?? []).filter((p) =>
    PRIORITIES.some((d) => d.key === p)
  );

  const trimmed = new Set<WidgetKey>(opts.compact ? COMPACT_TRIMMED : []);
  const keep = (key: WidgetKey) =>
    widgetEnabled(key, modules) && !trimmed.has(key);

  const layout = ROLE_LAYOUTS[role];

  // Surviving KPIs per grid, pre-computed so we can spot a grid whose title
  // no longer describes its contents.
  const survivors = layout.map((b) =>
    b.kind === "kpis" ? b.kpis.filter(keep) : null
  );

  // A titled grid exists to frame its module-gated KPIs — "Order flow · In
  // motion" frames orders and POs. If every gated KPI it was built around is
  // switched off, the heading becomes a lie over a near-empty row (an
  // orders-free workspace would get "Order flow" above a lone Low-stock
  // tile). Such a grid is "orphaned": its ungated survivors get folded into
  // the next real grid instead.
  const orphaned = layout.map((b, i) => {
    if (b.kind !== "kpis" || !b.title) return false;
    const surv = survivors[i] ?? [];
    if (surv.length === 0) return false; // dropped wholesale anyway
    return (
      b.kpis.some((k) => WIDGET_MODULE_GATES[k]) &&
      !surv.some((k) => WIDGET_MODULE_GATES[k])
    );
  });

  /** The next grid that renders in its own right and can absorb orphans. */
  const absorberAfter = (from: number): number => {
    for (let j = from + 1; j < layout.length; j++) {
      const b = layout[j];
      if (b.kind === "kpis" && (survivors[j]?.length ?? 0) > 0 && !orphaned[j]) {
        return j;
      }
    }
    return -1;
  };

  const absorbed = new Map<number, KpiKey[]>();
  layout.forEach((_b, i) => {
    if (!orphaned[i]) return;
    const target = absorberAfter(i);
    if (target >= 0) {
      absorbed.set(target, [
        ...(absorbed.get(target) ?? []),
        ...(survivors[i] ?? []),
      ]);
    }
  });

  const blocks: DashboardBlock[] = [];
  for (const [i, block] of layout.entries()) {
    if (block.kind === "kpis") {
      const own = survivors[i] ?? [];
      if (orphaned[i]) {
        // Folded into a later grid, or — with none to fold into — kept as an
        // untitled grid so the surviving signal is never simply lost.
        if (absorberAfter(i) >= 0) continue;
        if (own.length > 0) {
          blocks.push({
            kind: "kpis",
            id: block.id,
            srTitle: block.title?.title,
            kpis: own,
          });
        }
        continue;
      }
      const kpis = [...own, ...(absorbed.get(i) ?? [])];
      if (kpis.length > 0) blocks.push({ ...block, kpis });
    } else if (block.kind === "section") {
      if (keep(block.key)) blocks.push(block);
    } else if (block.kind === "columns") {
      const keys = block.keys.filter(keep);
      if (keys.length === 2) blocks.push(block);
      else if (keys.length === 1) blocks.push({ kind: "section", key: keys[0] });
    } else {
      const cards = modules
        ? block.cards.filter((c) => {
            const gate = CARD_MODULE_GATES[c];
            return !gate || modules.has(gate);
          })
        : block.cards;
      blocks.push({ ...block, cards });
    }
  }

  // Compact (single-room) dashboards guarantee the activity feed: the owner
  // of a tiny operation IS the floor operator, and the owner/admin layouts
  // don't all carry recent_scans by default.
  if (
    opts.compact &&
    !blocks.some(
      (b) => b.kind === "section" && b.key === "section.recent_scans"
    )
  ) {
    const qj = blocks.findIndex((b) => b.kind === "quick_jump");
    const insertAt = qj >= 0 ? qj : blocks.length;
    blocks.splice(insertAt, 0, {
      kind: "section",
      key: "section.recent_scans",
    });
  }

  if (picks.length === 0) return blocks;

  // Priority ordering. Two effects, both stable:
  //   - KPIs re-order boosted-first WITHIN each grid (never across grids, so
  //     a themed grid keeps its theme). Every grid is sorted, not just the
  //     first: the admin layout carries scans_today in its second grid, and
  //     sorting only the first made "what my team did today" a no-op there.
  //   - Section/columns blocks between the KPI grids and quick-jump hoist
  //     boosted-first. getting_started stays first; quick_jump stays last.
  //
  // A priority can only reorder what a role is entitled to see: "cash tied up
  // in stock" boosts the financial KPIs, which the admin and member layouts
  // deliberately omit, so it is intentionally inert for them rather than
  // leaking money figures to roles excluded from them by design.
  for (const [i, b] of blocks.entries()) {
    if (b.kind !== "kpis") continue;
    blocks[i] = { ...b, kpis: stableSortBy(b.kpis, (k) => boostRank([k], picks)) };
  }

  const sortable = (b: DashboardBlock) =>
    (b.kind === "section" && b.key !== "section.getting_started") ||
    b.kind === "columns";
  const head: DashboardBlock[] = [];
  const middle: DashboardBlock[] = [];
  const tail: DashboardBlock[] = [];
  let seenSortable = false;
  for (const b of blocks) {
    if (b.kind === "quick_jump") tail.push(b);
    else if (sortable(b)) {
      middle.push(b);
      seenSortable = true;
    } else if (seenSortable) middle.push(b);
    else head.push(b);
  }
  const sortedMiddle = stableSortBy(middle, (b) => {
    if (b.kind === "section") return boostRank([b.key], picks);
    if (b.kind === "columns") return boostRank(b.keys, picks);
    return Number.POSITIVE_INFINITY; // trailing kpi grids keep position by stability
  });

  return [...head, ...sortedMiddle, ...tail];
}
