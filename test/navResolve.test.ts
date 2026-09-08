import { describe, it, expect } from "vitest";
import {
  resolveNav,
  resolveUserNav,
  defaultNavPrefs,
  orgPrimaryKeys,
  ALL_NAV_ITEMS,
} from "@/lib/navData";
import { ALWAYS_PRIMARY, INDUSTRIES, primaryNavKeys } from "@/lib/industries";
import { ALWAYS_ON_MODULES, modulesFromActivities } from "@/lib/modules";

const allKeys = new Set(ALL_NAV_ITEMS.map((i) => i.key));

function visibleKeys(nav: ReturnType<typeof resolveNav>): string[] {
  return nav.groups.flatMap((g) => g.items.map((i) => i.key));
}

describe("industry registry integrity", () => {
  it("every industry primaryNav key is a real nav item", () => {
    // A typo'd key would be silently skipped by the resolver forever.
    for (const ind of INDUSTRIES) {
      for (const k of ind.primaryNav) {
        expect(allKeys.has(k), `${ind.slug} → ${k}`).toBe(true);
      }
    }
  });

  it("primaryNavKeys always includes ALWAYS_PRIMARY", () => {
    for (const slug of [null, ...INDUSTRIES.map((i) => i.slug)]) {
      const keys = primaryNavKeys(slug);
      for (const locked of ALWAYS_PRIMARY) expect(keys).toContain(locked);
    }
  });
});

describe("orgPrimaryKeys (org enabled_modules layer)", () => {
  it("null/empty modules fall back to industry defaults", () => {
    expect(orgPrimaryKeys("food-beverage", null)).toEqual(
      new Set(primaryNavKeys("food-beverage"))
    );
    expect(orgPrimaryKeys(null, [])).toEqual(new Set(primaryNavKeys(null)));
  });

  it("modules override the industry set", () => {
    const keys = orgPrimaryKeys(
      "ecommerce-3pl",
      modulesFromActivities(["track-lots"])
    );
    expect(keys.has("lots")).toBe(true);
    expect(keys.has("orders")).toBe(false); // 3PL default, but org opted out
  });

  it("ALWAYS_ON_MODULES survive junk module lists (anti-lockout)", () => {
    // enabled_modules is REST-writable by owner/admin; garbage must never
    // strand the workspace without inventory or settings.
    const keys = orgPrimaryKeys(null, ["garbage-key"]);
    for (const k of ALWAYS_ON_MODULES) expect(keys.has(k)).toBe(true);
  });
});

describe("resolveNav with org modules", () => {
  it("keeps grouped IA and demotes deselected modules to More", () => {
    const nav = resolveNav(null, modulesFromActivities(["ship-orders"]));
    const visible = visibleKeys(nav);
    expect(visible).toContain("orders");
    expect(visible).not.toContain("purchase-orders");
    expect(nav.more.map((i) => i.key)).toContain("purchase-orders");
  });

  it("nothing becomes unreachable — visible + more covers every item", () => {
    const nav = resolveNav("agriculture-seed", modulesFromActivities([]));
    const union = new Set([...visibleKeys(nav), ...nav.more.map((i) => i.key)]);
    expect(union.size).toBe(ALL_NAV_ITEMS.length);
  });
});

describe("resolveUserNav precedence + anti-lockout", () => {
  it("user prefs win over org modules", () => {
    const prefs = { order: ["overview", "kits", "settings"], hidden: [] };
    const nav = resolveUserNav(null, prefs, modulesFromActivities([]));
    const flatList = nav.groups[0].items.map((i) => i.key);
    expect(flatList.slice(0, 3)).toEqual(["overview", "kits", "settings"]);
  });

  it("no prefs → falls through to org modules layer", () => {
    const nav = resolveUserNav(
      null,
      null,
      modulesFromActivities(["build-kits"])
    );
    expect(visibleKeys(nav)).toContain("kits");
    expect(visibleKeys(nav)).not.toContain("orders");
  });

  it("enforces ALWAYS_PRIMARY at resolve time even when prefs hide them", () => {
    // The guard used to exist only in the save path; a prefs row written by
    // any other path must never render a sidenav without Settings.
    const nav = resolveUserNav(null, {
      order: ["inventory"],
      hidden: ["settings", "overview"],
    });
    const flatList = nav.groups[0].items.map((i) => i.key);
    expect(flatList).toContain("settings");
    expect(flatList).toContain("overview");
    const moreKeys = nav.more.map((i) => i.key);
    expect(moreKeys).not.toContain("settings");
    expect(moreKeys).not.toContain("overview");
  });
});

describe("defaultNavPrefs", () => {
  it("seeds visible = workspace primary set, everything else hidden", () => {
    const prefs = defaultNavPrefs(null, modulesFromActivities(["take-returns"]));
    const visible = prefs.order.filter((k) => !prefs.hidden.includes(k));
    expect(visible).toContain("returns");
    expect(visible).toContain("inventory");
    expect(prefs.hidden).toContain("orders");
  });

  it("without modules, matches the industry defaults", () => {
    const prefs = defaultNavPrefs("manufacturing-assembly");
    const visible = prefs.order.filter((k) => !prefs.hidden.includes(k));
    expect(new Set(visible)).toEqual(
      new Set(primaryNavKeys("manufacturing-assembly").filter((k) => allKeys.has(k)))
    );
  });
});
