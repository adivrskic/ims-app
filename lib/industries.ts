/**
 * Industry registry.
 *
 * The industry a workspace picks at onboarding (`orgs.industry`) drives which
 * pages are surfaced "primary" in the sidenav by default — and, as roadmap
 * features land, which industry-specific tools auto-appear.
 *
 * `primaryNav` is an ORDERED list of nav keys (see lib/navData.ts) shown by
 * default for that industry; every other available page tucks under "More".
 * It may reference keys for features that don't exist yet (e.g. "lots",
 * "serials", "kits") — the resolver filters those out until the page ships,
 * so a new industry-specific feature surfaces automatically with zero rework.
 *
 * Pure data — no React, no server-only — so it's safe to import anywhere
 * (onboarding form, server actions, settings, the SideRail).
 */

export const INDUSTRY_SLUGS = [
  "flooring-building-materials",
  "manufacturing-assembly",
  "food-beverage",
  "automotive-parts",
  "pharmaceuticals-medical",
  "ecommerce-3pl",
  "electrical-plumbing",
  "agriculture-seed",
] as const;

export type IndustrySlug = (typeof INDUSTRY_SLUGS)[number];

export interface IndustryDef {
  slug: IndustrySlug;
  label: string;
  /** ≤ 5 words — identifies, doesn't explain (mirrors the marketing site). */
  desc: string;
  /** Ordered nav keys shown by default. May include not-yet-built keys. */
  primaryNav: string[];
}

// Always surfaced regardless of industry — the home + the settings entry.
export const ALWAYS_PRIMARY = ["overview", "settings"] as const;

// Shown when a workspace has no industry set (existing orgs / skipped step):
// the full, generic set in natural order — nothing hidden.
export const DEFAULT_PRIMARY_NAV = [
  "overview",
  "inventory",
  "analytics",
  "cycle-counts",
  "orders",
  "purchase-orders",
  "returns",
  "suppliers",
  "customers",
  "facilities",
  "integrations",
  "settings",
];

export const INDUSTRIES: IndustryDef[] = [
  {
    slug: "flooring-building-materials",
    label: "Flooring & Building Materials",
    desc: "Hardwood, tile, adhesives",
    // Dye-lot matching is core → lots leads once it ships.
    primaryNav: [
      "overview",
      "inventory",
      "lots",
      "orders",
      "purchase-orders",
      "suppliers",
      "facilities",
      "analytics",
      "settings",
    ],
  },
  {
    slug: "manufacturing-assembly",
    label: "Manufacturing & Assembly",
    desc: "Parts, kits, sub-assemblies",
    primaryNav: [
      "overview",
      "inventory",
      "kits",
      "purchase-orders",
      "cycle-counts",
      "suppliers",
      "facilities",
      "analytics",
      "settings",
    ],
  },
  {
    slug: "food-beverage",
    label: "Food & Beverage",
    desc: "Lot tracking & FEFO",
    primaryNav: [
      "overview",
      "inventory",
      "lots",
      "cycle-counts",
      "orders",
      "suppliers",
      "returns",
      "analytics",
      "settings",
    ],
  },
  {
    slug: "automotive-parts",
    label: "Automotive & Parts",
    desc: "Catalogs and dealer ops",
    primaryNav: [
      "overview",
      "inventory",
      "serials",
      "orders",
      "customers",
      "suppliers",
      "purchase-orders",
      "analytics",
      "settings",
    ],
  },
  {
    slug: "pharmaceuticals-medical",
    label: "Pharmaceuticals & Medical",
    desc: "Compliance-first inventory",
    primaryNav: [
      "overview",
      "inventory",
      "lots",
      "cycle-counts",
      "returns",
      "suppliers",
      "analytics",
      "settings",
    ],
  },
  {
    slug: "ecommerce-3pl",
    label: "E-commerce & 3PL",
    desc: "Multi-tenant & white-label",
    primaryNav: [
      "overview",
      "orders",
      "inventory",
      "integrations",
      "returns",
      "customers",
      "analytics",
      "settings",
    ],
  },
  {
    slug: "electrical-plumbing",
    label: "Electrical & Plumbing Supply",
    desc: "Fittings, fixtures, kits",
    primaryNav: [
      "overview",
      "inventory",
      "kits",
      "orders",
      "purchase-orders",
      "suppliers",
      "facilities",
      "settings",
    ],
  },
  {
    slug: "agriculture-seed",
    label: "Agriculture & Seed",
    desc: "Seasonal & bulk inventory",
    primaryNav: [
      "overview",
      "inventory",
      "lots",
      "cycle-counts",
      "purchase-orders",
      "suppliers",
      "analytics",
      "settings",
    ],
  },
];

export function isIndustrySlug(v: unknown): v is IndustrySlug {
  return typeof v === "string" && INDUSTRY_SLUGS.includes(v as IndustrySlug);
}

export function getIndustry(slug: string | null | undefined): IndustryDef | null {
  if (!slug) return null;
  return INDUSTRIES.find((i) => i.slug === slug) ?? null;
}

/**
 * The ordered primary nav-key list for an industry (or the generic default
 * when null/unknown), with ALWAYS_PRIMARY keys guaranteed present.
 */
export function primaryNavKeys(slug: string | null | undefined): string[] {
  const def = getIndustry(slug);
  const base = def ? def.primaryNav : DEFAULT_PRIMARY_NAV;
  // Guarantee always-primary keys exist (settings appended if missing).
  const out = [...base];
  for (const k of ALWAYS_PRIMARY) if (!out.includes(k)) out.push(k);
  return out;
}
