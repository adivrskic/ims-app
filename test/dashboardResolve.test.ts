import { describe, it, expect } from "vitest";
import {
  resolveDashboard,
  KPI_KEYS,
  SECTION_KEYS,
  type DashboardBlock,
} from "@/lib/dashboardWidgets";
import { modulesFromActivities } from "@/lib/modules";

/** Flatten a resolved layout to a comparable list of widget/card ids. */
function flat(blocks: DashboardBlock[]): string[] {
  return blocks.flatMap((b) => {
    if (b.kind === "kpis") return [`kpis:${b.kpis.join(",")}`];
    if (b.kind === "section") return [b.key];
    if (b.kind === "columns") return [`columns:${b.keys.join("+")}`];
    return [`quick_jump:${b.cards.join(",")}`];
  });
}

/**
 * GOLDEN PARITY TEST — null modules + null priorities must reproduce the
 * pre-registry role layouts exactly (widget sets AND order), with only
 * section.getting_started prepended (the page renders that block solely for
 * young workspaces). If this fails, every existing customer's overview
 * silently changed — treat as a regression, not a snapshot to refresh.
 */
describe("resolveDashboard parity (existing orgs)", () => {
  it("member layout matches the pre-registry page", () => {
    expect(flat(resolveDashboard("member", null, null))).toEqual([
      "section.getting_started",
      "kpis:kpi.scans_today,kpi.open_orders,kpi.pick_queue,kpi.low_stock",
      "section.reorder_alerts",
      "section.pick_queue",
      "section.recent_scans",
      "quick_jump:inventory,orders,facilities",
    ]);
  });

  it("admin layout matches the pre-registry page", () => {
    expect(flat(resolveDashboard("admin", null, null))).toEqual([
      "section.getting_started",
      "kpis:kpi.open_orders,kpi.pick_queue,kpi.pos_in_transit,kpi.low_stock",
      "kpis:kpi.scans_today,kpi.units_on_hand,kpi.products,kpi.sections",
      "section.reorder_alerts",
      "columns:section.pick_queue+section.pos_in_transit",
      "section.top_movers",
      "section.recent_scans",
      "quick_jump:inventory,orders,analytics,facilities,integrations",
    ]);
  });

  it("owner layout matches the pre-registry page", () => {
    expect(flat(resolveDashboard("owner", null, null))).toEqual([
      "section.getting_started",
      "kpis:kpi.scans_today,kpi.units_on_hand,kpi.open_orders,kpi.low_stock,kpi.inventory_value,kpi.dead_stock",
      "section.top_movers",
      "columns:section.pick_queue+section.pos_in_transit",
      "section.reorder_alerts",
      "quick_jump:analytics,inventory,orders,facilities,integrations",
    ]);
  });

  it("undefined behaves like null (everything on)", () => {
    expect(resolveDashboard("owner", undefined, undefined)).toEqual(
      resolveDashboard("owner", null, null)
    );
  });
});

describe("module gating", () => {
  it("no orders module → order-flow widgets disappear", () => {
    const mods = modulesFromActivities(["receive-stock"]); // no ship-orders
    const keys = flat(resolveDashboard("admin", mods, null)).join(" ");
    expect(keys).not.toContain("kpi.open_orders");
    expect(keys).not.toContain("kpi.pick_queue");
    expect(keys).not.toContain("section.pick_queue");
    // Columns pair collapses to the single remaining section.
    expect(keys).toContain("section.pos_in_transit");
    expect(keys).not.toContain("columns:");
  });

  it("no purchasing module → inbound + reorder widgets disappear, low-stock KPI stays", () => {
    const mods = modulesFromActivities(["ship-orders"]);
    const keys = flat(resolveDashboard("owner", mods, null)).join(" ");
    expect(keys).not.toContain("kpi.pos_in_transit");
    expect(keys).not.toContain("section.pos_in_transit");
    expect(keys).not.toContain("section.reorder_alerts");
    expect(keys).toContain("kpi.low_stock"); // locked signal for everyone
  });

  it("storage-room minimum (no activities) keeps a working dashboard", () => {
    const mods = modulesFromActivities([]);
    const blocks = resolveDashboard("owner", mods, null, { compact: true });
    const keys = flat(blocks).join(" ");
    expect(keys).toContain("kpi.units_on_hand");
    expect(keys).toContain("kpi.low_stock");
    expect(keys).toContain("section.recent_scans");
    expect(keys).toContain("quick_jump");
    expect(keys).not.toContain("kpi.open_orders");
    expect(keys).not.toContain("section.top_movers"); // compact trim
    expect(keys).not.toContain("kpi.products"); // compact trim
  });

  it("quick-jump cards filter by module (orders/integrations gated)", () => {
    const mods = modulesFromActivities([]);
    const blocks = resolveDashboard("admin", mods, null);
    const qj = blocks.find((b) => b.kind === "quick_jump");
    expect(qj && qj.kind === "quick_jump" ? qj.cards : []).toEqual([
      "inventory",
      "analytics",
      "facilities",
    ]);
  });

  it("junk module strings are tolerated, never fatal", () => {
    const blocks = resolveDashboard("member", ["garbage", "orders"], ["junk"]);
    expect(blocks.length).toBeGreaterThan(0);
    const keys = flat(blocks).join(" ");
    expect(keys).toContain("kpi.open_orders");
  });
});

describe("titled KPI grids never outlive their subject", () => {
  it("admin with no orders and no purchasing loses the 'Order flow' heading", () => {
    // The admin layout's first grid is titled "Order flow · In motion" and is
    // built around orders/PO KPIs. low_stock is deliberately ungated, so
    // without special handling the heading survived above a single tile.
    const mods = modulesFromActivities(["track-lots"]);
    const blocks = resolveDashboard("admin", mods, null);
    const titled = blocks.filter((b) => b.kind === "kpis" && b.title);
    expect(titled.map((b) => (b.kind === "kpis" ? b.title?.eyebrow : ""))).not.toContain(
      "Order flow"
    );
    // The surviving signal is folded into the inventory grid, never dropped.
    const kpis = blocks.flatMap((b) => (b.kind === "kpis" ? b.kpis : []));
    expect(kpis).toContain("kpi.low_stock");
    expect(kpis).toContain("kpi.units_on_hand");
  });

  it("keeps the heading when any gated KPI in it survives", () => {
    const mods = modulesFromActivities(["receive-stock"]); // POs on, orders off
    const blocks = resolveDashboard("admin", mods, null);
    const eyebrows = blocks.flatMap((b) =>
      b.kind === "kpis" && b.title ? [b.title.eyebrow] : []
    );
    expect(eyebrows).toContain("Order flow");
  });

  it("does not disturb a fully-enabled admin layout", () => {
    // "sell-online" is needed too: the quick-jump Integrations card gates on
    // it, so without it the layouts differ on cards rather than on grids.
    const mods = modulesFromActivities([
      "receive-stock",
      "ship-orders",
      "sell-online",
    ]);
    expect(flat(resolveDashboard("admin", mods, null))).toEqual(
      flat(resolveDashboard("admin", null, null))
    );
  });
});

describe("priority ordering", () => {
  it("hoists the picked priority's sections above the rest", () => {
    const blocks = resolveDashboard("owner", null, ["never-run-out"]);
    const sections = flat(blocks).filter(
      (k) => k.startsWith("section.") || k.startsWith("columns:")
    );
    // reorder_alerts (boosted) now leads the section run; getting_started
    // stays pinned first overall and quick_jump last.
    expect(flat(blocks)[0]).toBe("section.getting_started");
    expect(sections.filter((s) => s !== "section.getting_started")[0]).toBe(
      "section.reorder_alerts"
    );
    expect(flat(blocks).at(-1)).toMatch(/^quick_jump:/);
  });

  it("reorders KPIs inside the first grid boosted-first, stable elsewhere", () => {
    const blocks = resolveDashboard("owner", null, [
      "cash-in-stock",
      "never-run-out",
    ]);
    const firstKpis = blocks.find((b) => b.kind === "kpis");
    expect(firstKpis && firstKpis.kind === "kpis" ? firstKpis.kpis : []).toEqual([
      "kpi.inventory_value", // cash (pick 1)
      "kpi.dead_stock", // cash (pick 1)
      "kpi.low_stock", // never-run-out (pick 2)
      "kpi.scans_today", // rest keep original relative order
      "kpi.units_on_hand",
      "kpi.open_orders",
    ]);
  });

  it("sorts every KPI grid, not just the first", () => {
    // scans_today lives in the admin layout's SECOND grid; sorting only the
    // first made "what my team did today" inert for admins.
    const blocks = resolveDashboard("admin", null, ["team-activity"]);
    const grids = blocks.filter((b) => b.kind === "kpis");
    const second = grids[1];
    expect(second && second.kind === "kpis" ? second.kpis[0] : null).toBe(
      "kpi.scans_today"
    );
  });

  it("no priorities → no reordering", () => {
    expect(resolveDashboard("admin", null, [])).toEqual(
      resolveDashboard("admin", null, null)
    );
  });
});

describe("widget key registry", () => {
  it("keys are unique across kpis and sections", () => {
    const all = [...KPI_KEYS, ...SECTION_KEYS];
    expect(new Set(all).size).toBe(all.length);
  });
});
