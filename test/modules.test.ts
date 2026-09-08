import { describe, it, expect } from "vitest";
import {
  ACTIVITIES,
  ACTIVITY_KEYS,
  ALWAYS_ON_MODULES,
  PRIORITIES,
  PRIORITY_KEYS,
  MAX_PRIORITIES,
  SIZE_CLASSES,
  defaultActivities,
  modulesFromActivities,
  normalizePriorities,
  isActivityKey,
  isPriorityKey,
  isSizeClass,
} from "@/lib/modules";
import { ALL_NAV_ITEMS } from "@/lib/navData";
import { INDUSTRIES, primaryNavKeys } from "@/lib/industries";
import { KPI_KEYS, SECTION_KEYS } from "@/lib/dashboardWidgets";

/**
 * The activity registry is the wizard's contract with the nav system: every
 * plain-language statement maps to real nav keys, and the union of choices
 * becomes orgs.enabled_modules. Pinned apiScopes-style — a typo'd key would
 * otherwise be silently skipped by the resolvers forever.
 */
const EXPECTED_ACTIVITY_KEYS = [
  "receive-stock",
  "ship-orders",
  "track-lots",
  "track-serials",
  "build-kits",
  "move-stock",
  "take-returns",
  "count-stock",
  "sell-online",
];

const EXPECTED_PRIORITY_KEYS = [
  "never-run-out",
  "ship-faster",
  "inbound-visibility",
  "cash-in-stock",
  "team-activity",
];

describe("activity registry", () => {
  it("exposes exactly the pinned activity keys", () => {
    expect([...ACTIVITY_KEYS]).toEqual(EXPECTED_ACTIVITY_KEYS);
    expect(ACTIVITIES.map((a) => a.key)).toEqual(EXPECTED_ACTIVITY_KEYS);
  });

  it("every activity nav key maps to a real, built nav item", () => {
    const navKeys = new Set(ALL_NAV_ITEMS.map((i) => i.key));
    for (const a of ACTIVITIES) {
      for (const k of a.navKeys) {
        expect(navKeys.has(k), `${a.key} → ${k}`).toBe(true);
      }
    }
  });

  it("every ALWAYS_ON module is a real nav item", () => {
    const navKeys = new Set(ALL_NAV_ITEMS.map((i) => i.key));
    for (const k of ALWAYS_ON_MODULES) {
      expect(navKeys.has(k), k).toBe(true);
    }
  });

  it("activities have labels and descriptions", () => {
    for (const a of ACTIVITIES) {
      expect(a.label.length).toBeGreaterThan(0);
      expect(a.desc.length).toBeGreaterThan(0);
    }
  });
});

describe("defaultActivities", () => {
  it("pre-checks the activities each industry's nav implies", () => {
    const flooring = defaultActivities(
      primaryNavKeys("flooring-building-materials")
    );
    expect(flooring).toContain("receive-stock"); // purchase-orders in nav
    expect(flooring).toContain("ship-orders"); // orders in nav
    expect(flooring).toContain("track-lots"); // lots in nav
    expect(flooring).not.toContain("track-serials");
  });

  it("gives a sensible default for no industry", () => {
    const generic = defaultActivities(primaryNavKeys(null));
    expect(generic).toContain("receive-stock");
    expect(generic).toContain("ship-orders");
  });

  it("every industry pre-checks at least one activity", () => {
    for (const ind of INDUSTRIES) {
      expect(
        defaultActivities(primaryNavKeys(ind.slug)).length,
        ind.slug
      ).toBeGreaterThan(0);
    }
  });
});

describe("modulesFromActivities", () => {
  it("always includes the ALWAYS_ON set", () => {
    const mods = modulesFromActivities([]);
    for (const k of ALWAYS_ON_MODULES) expect(mods).toContain(k);
  });

  it("unions the selected activities' nav keys", () => {
    const mods = modulesFromActivities(["receive-stock", "track-lots"]);
    expect(mods).toContain("purchase-orders");
    expect(mods).toContain("suppliers");
    expect(mods).toContain("lots");
    expect(mods).not.toContain("orders");
  });

  it("skips unknown activity keys", () => {
    expect(modulesFromActivities(["nonsense"])).toEqual(
      modulesFromActivities([])
    );
  });
});

describe("priority registry", () => {
  it("exposes exactly the pinned priority keys", () => {
    expect([...PRIORITY_KEYS]).toEqual(EXPECTED_PRIORITY_KEYS);
    expect(PRIORITIES.map((p) => p.key)).toEqual(EXPECTED_PRIORITY_KEYS);
  });

  it("every boost target is a real dashboard widget key", () => {
    const widgetKeys = new Set<string>([...KPI_KEYS, ...SECTION_KEYS]);
    for (const p of PRIORITIES) {
      for (const b of p.boosts) {
        expect(widgetKeys.has(b), `${p.key} → ${b}`).toBe(true);
      }
    }
  });

  it("normalizePriorities validates, dedupes, and caps", () => {
    expect(
      normalizePriorities([
        "ship-faster",
        "junk",
        "ship-faster",
        "never-run-out",
        "cash-in-stock",
        "team-activity",
      ])
    ).toEqual(["ship-faster", "never-run-out", "cash-in-stock"]);
    expect(normalizePriorities([]).length).toBeLessThanOrEqual(MAX_PRIORITIES);
  });
});

describe("type guards", () => {
  it("accept known keys and reject junk", () => {
    expect(isActivityKey("receive-stock")).toBe(true);
    expect(isActivityKey("receive_stock")).toBe(false);
    expect(isPriorityKey("ship-faster")).toBe(true);
    expect(isPriorityKey("")).toBe(false);
    expect(isSizeClass("single_room")).toBe(true);
    expect(isSizeClass("huge")).toBe(false);
    expect(SIZE_CLASSES).toEqual(["single_room", "single_site", "multi_site"]);
  });
});
