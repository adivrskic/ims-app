import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { productVelocities } from "@/lib/data/velocity";

/**
 * Directed putaway / slotting optimization (roadmap #8), Phase 1 — read-side.
 *
 * Given a facility's spatial layout (sections + door/staging elements from the
 * builder) and current occupancy (`locations`), score candidate slots for a
 * product and surface a slotting-health report of mis-slotted SKUs.
 *
 * Everything here is READ-ONLY: it suggests and reports. Physical moves stay
 * scan-confirmed on the mobile app (see the plan's architecture boundary).
 *
 * Scoring balances (weights tuned in ONE place — `WEIGHTS`):
 *   1. category match    — section.default_category === product.category_id
 *   2. consolidation      — a slot/section already holding this SKU
 *   3. golden zone        — fast movers near a door/staging origin
 *   4. level ergonomics   — fast movers low (less reach), slow/bulk high
 *   5. capacity fit       — respect sections.slot_capacity
 *   6. fill-existing      — top up partially-used slots before opening new ones
 *
 * Distance is centroid Euclidean to the nearest door/staging element. Section
 * rotation rotates about the centre, so the centroid is rotation-invariant — no
 * rotation term is needed for centroid distance. Aisle/path distance is a later
 * refinement (Open decision #4).
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "app", any>;

// ── Tunable weights ───────────────────────────────────────────────────────
// Each factor contributes `factor[0..1] * weight`. Zone is dropped (and its
// weight excluded from normalization) when a facility has no door/staging.
const WEIGHTS = {
  category: 30,
  consolidation: 25,
  zone: 25,
  level: 10,
  capacity: 10,
  fillExisting: 5,
} as const;

// A suggestion needs to beat the current placement by this fraction of the
// score range to count as "mis-slotted" in the health report — avoids churning
// on rounding-level differences.
const HEALTH_IMPROVEMENT_THRESHOLD = 0.12;

// ── Public shapes ─────────────────────────────────────────────────────────

export interface SlotRef {
  sectionId: string;
  sectionCode: string;
  bay: number;
  level: number;
}

export interface SlotSuggestion {
  slot: SlotRef;
  /** 0–100, normalized over the applicable factors. Higher = better home. */
  score: number;
  /** Human reasons, most-significant first ("near dock", "matches Flooring"). */
  reasons: string[];
  /** Label like "A-12-1" for compact display. */
  label: string;
}

export interface SuggestionResult {
  suggestions: SlotSuggestion[];
  /** No sections / no slots to score against. */
  noLayout: boolean;
  /** No door or staging element → proximity factor was skipped. */
  noOrigin: boolean;
}

export interface MisSlot {
  productId: string;
  productName: string;
  sku: string | null;
  current: SlotRef & { label: string };
  suggested: SlotSuggestion;
  /** Why the current slot is wrong, e.g. "fast mover stuck in the back". */
  reason: string;
  /** velocity (units/day) of this SKU — the impact multiplier. */
  velocity: number;
  /** Ranking weight: velocity × score gain. Higher = fix first. */
  impact: number;
}

export interface SlottingHealth {
  facilityId: string;
  facilityName: string;
  totalSlots: number;
  occupiedSlots: number;
  /** SKUs whose current slot disagrees with the suggestion. */
  misSlottedCount: number;
  /** Fast movers (top velocity tertile) currently sitting far from an origin. */
  fastMoversFar: number;
  /** Slots in the golden zone occupied by slow movers (blocking prime space). */
  goldenZoneBlocked: number;
  /** Products whose category disagrees with their section's default category. */
  categoryMismatches: number;
  hasOrigin: boolean;
  hasLayout: boolean;
  misSlots: MisSlot[];
}

// ── Internal context ──────────────────────────────────────────────────────

interface SectionCtx {
  id: string;
  code: string;
  name: string;
  defaultCategory: string | null;
  totalBays: number;
  totalLevels: number;
  slotCapacity: number | null;
  centroid: { x: number; y: number };
  /** 0 = nearest origin, 1 = farthest. null when no origins exist. */
  proximityScore: number | null;
}

interface SlotOccupancy {
  qty: number;
  productIds: Set<string>;
}

interface FacilityCtx {
  sections: SectionCtx[];
  /** slotKey(`${sectionId}:${bay}:${level}`) → occupancy. */
  occupancy: Map<string, SlotOccupancy>;
  /** sectionId → set of product ids stored anywhere in that section. */
  sectionProducts: Map<string, Set<string>>;
  hasOrigin: boolean;
  hasLayout: boolean;
}

const slotKey = (sectionId: string, bay: number, level: number) =>
  `${sectionId}:${bay}:${level}`;

const slotLabel = (s: { sectionCode: string; bay: number; level: number }) =>
  `${s.sectionCode}-${String(s.bay).padStart(2, "0")}-${s.level}`;

// ── Geometry ──────────────────────────────────────────────────────────────

function centroidOf(r: {
  floor_x: number;
  floor_y: number;
  floor_width: number;
  floor_height: number;
}) {
  return {
    x: r.floor_x + r.floor_width / 2,
    y: r.floor_y + r.floor_height / 2,
  };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── Facility context loader ───────────────────────────────────────────────

async function loadFacilityCtx(
  supabase: Client,
  orgId: string,
  warehouseId: string
): Promise<FacilityCtx> {
  const [{ data: sectionRows }, { data: elementRows }, { data: locationRows }] =
    await Promise.all([
      supabase
        .from("sections")
        .select(
          "id, code, name, default_category, total_bays, total_levels, slot_capacity, floor_x, floor_y, floor_width, floor_height"
        )
        .eq("org_id", orgId)
        .eq("warehouse_id", warehouseId),
      supabase
        .from("layout_elements")
        .select("kind, floor_x, floor_y, floor_width, floor_height")
        .eq("org_id", orgId)
        .eq("warehouse_id", warehouseId)
        .in("kind", ["door", "staging"]),
      supabase
        .from("locations")
        .select("product_id, section_id, bay, level, quantity")
        .eq("org_id", orgId)
        .eq("warehouse_id", warehouseId)
        .eq("is_active", true),
    ]);

  // Travel-distance origins = door + staging centroids.
  const origins = (
    (elementRows ?? []) as Array<{
      floor_x: number;
      floor_y: number;
      floor_width: number;
      floor_height: number;
    }>
  ).map(centroidOf);
  const hasOrigin = origins.length > 0;

  // Raw section rows → context with centroid + nearest-origin distance.
  const rawSections = (sectionRows ?? []) as Array<{
    id: string;
    code: string | null;
    name: string | null;
    default_category: string | null;
    total_bays: number | null;
    total_levels: number | null;
    slot_capacity: number | null;
    floor_x: number | string;
    floor_y: number | string;
    floor_width: number | string;
    floor_height: number | string;
  }>;

  const withDistance = rawSections.map((s) => {
    const centroid = centroidOf({
      floor_x: Number(s.floor_x),
      floor_y: Number(s.floor_y),
      floor_width: Number(s.floor_width),
      floor_height: Number(s.floor_height),
    });
    const nearest = hasOrigin
      ? Math.min(...origins.map((o) => dist(centroid, o)))
      : null;
    return { s, centroid, nearest };
  });

  // Normalize nearest-origin distance into a 0..1 proximity rank across the
  // facility (0 = closest section, 1 = farthest). Single section → 0.
  const dists = withDistance
    .map((w) => w.nearest)
    .filter((d): d is number => d != null);
  const minD = dists.length ? Math.min(...dists) : 0;
  const maxD = dists.length ? Math.max(...dists) : 0;
  const span = maxD - minD;

  const sections: SectionCtx[] = withDistance.map(({ s, centroid, nearest }) => ({
    id: s.id,
    code: s.code ?? "",
    name: s.name ?? "",
    defaultCategory: s.default_category,
    totalBays: Math.max(1, s.total_bays ?? 1),
    totalLevels: Math.max(1, s.total_levels ?? 1),
    slotCapacity: s.slot_capacity,
    centroid,
    proximityScore:
      nearest == null ? null : span > 0 ? (nearest - minD) / span : 0,
  }));

  // Occupancy maps.
  const occupancy = new Map<string, SlotOccupancy>();
  const sectionProducts = new Map<string, Set<string>>();
  for (const l of (locationRows ?? []) as Array<{
    product_id: string | null;
    section_id: string | null;
    bay: number | null;
    level: number | null;
    quantity: number | null;
  }>) {
    if (!l.section_id || l.bay == null || l.level == null) continue;
    const key = slotKey(l.section_id, l.bay, l.level);
    const cur = occupancy.get(key) ?? { qty: 0, productIds: new Set<string>() };
    cur.qty += l.quantity ?? 0;
    if (l.product_id) cur.productIds.add(l.product_id);
    occupancy.set(key, cur);
    if (l.product_id) {
      const set = sectionProducts.get(l.section_id) ?? new Set<string>();
      set.add(l.product_id);
      sectionProducts.set(l.section_id, set);
    }
  }

  return {
    sections,
    occupancy,
    sectionProducts,
    hasOrigin,
    hasLayout: sections.length > 0,
  };
}

// ── Scoring ───────────────────────────────────────────────────────────────

interface ScoredProduct {
  id: string;
  categoryId: string | null;
  velocityPct: number; // 0..1 across the facility's on-hand products
  qtyToPlace: number; // incoming/placed units, for capacity fit (≥1)
}

interface ScoredSlot {
  section: SectionCtx;
  bay: number;
  level: number;
}

/**
 * Score one slot for one product. Returns the normalized 0..100 score plus the
 * reasons that drove it, or null when the slot is at/over capacity.
 *
 * Note: when the health report scores a product's *current* slot, that slot's
 * own units count toward the consolidation factor. That biases the status quo
 * upward (we under-suggest rather than churn), so only clearly-better homes —
 * a strong zone or category swing past HEALTH_IMPROVEMENT_THRESHOLD — surface.
 */
function scoreSlot(
  slot: ScoredSlot,
  product: ScoredProduct,
  ctx: FacilityCtx
): { score: number; reasons: string[] } | null {
  const { section } = slot;
  const key = slotKey(section.id, slot.bay, slot.level);
  const occ = ctx.occupancy.get(key);
  const qty = occ?.qty ?? 0;
  const cap = section.slotCapacity;

  // Hard filter: a slot already at/over capacity can't take the incoming units.
  if (cap != null && qty >= cap) return null;

  const reasons: string[] = [];
  let weighted = 0;
  let totalWeight = 0;

  // 1. Category match.
  totalWeight += WEIGHTS.category;
  if (
    section.defaultCategory &&
    product.categoryId &&
    section.defaultCategory === product.categoryId
  ) {
    weighted += WEIGHTS.category;
    reasons.push(`matches section category`);
  }

  // 2. Consolidation — same SKU already in this slot or section.
  totalWeight += WEIGHTS.consolidation;
  const slotHasSku = occ?.productIds.has(product.id) ?? false;
  const sectionHasSku =
    ctx.sectionProducts.get(section.id)?.has(product.id) ?? false;
  if (slotHasSku) {
    weighted += WEIGHTS.consolidation;
    reasons.push(`consolidates with ${qty} unit${qty === 1 ? "" : "s"} here`);
  } else if (sectionHasSku) {
    weighted += WEIGHTS.consolidation * 0.6;
    reasons.push(`same SKU already in this section`);
  }

  // 3. Golden zone — fast movers want proximity. Only when origins exist.
  if (section.proximityScore != null) {
    totalWeight += WEIGHTS.zone;
    const proximity = 1 - section.proximityScore; // 1 = closest to an origin
    // Alignment of velocity rank with proximity: a fast mover (pct→1) in a
    // close slot (proximity→1) scores ~1; a fast mover in the back scores ~0.
    const alignment = 1 - Math.abs(product.velocityPct - proximity);
    weighted += WEIGHTS.zone * alignment;
    if (product.velocityPct >= 0.66 && proximity >= 0.66) {
      reasons.push(`near dock · fast mover`);
    } else if (product.velocityPct <= 0.33 && proximity <= 0.4) {
      reasons.push(`back zone suits a slow mover`);
    } else if (proximity >= 0.66) {
      reasons.push(`near dock`);
    }
  }

  // 4. Level ergonomics — fast movers low, slow movers high.
  totalWeight += WEIGHTS.level;
  const levelFrac =
    section.totalLevels > 1 ? (slot.level - 1) / (section.totalLevels - 1) : 0;
  const lowness = 1 - levelFrac; // 1 = ground level
  // Fast movers reward lowness; slow movers are fine high.
  const ergonomics =
    product.velocityPct * lowness + (1 - product.velocityPct) * 0.5;
  weighted += WEIGHTS.level * ergonomics;
  if (product.velocityPct >= 0.66 && slot.level === 1) {
    reasons.push(`ground level — quick pick`);
  }

  // 5. Capacity fit — reward a clean fit, penalize tight overflow.
  if (cap != null) {
    totalWeight += WEIGHTS.capacity;
    const after = qty + product.qtyToPlace;
    if (after <= cap) {
      weighted += WEIGHTS.capacity;
      const room = cap - qty;
      reasons.push(`fits (${room} of ${cap} free)`);
    } else {
      // Partial — fits some but spills. Half credit scaled by how much fits.
      const fits = Math.max(0, cap - qty) / product.qtyToPlace;
      weighted += WEIGHTS.capacity * 0.5 * Math.min(1, fits);
    }
  }

  // 6. Fill-existing — mild nudge to top up a partly-used compatible slot
  //    before opening a brand-new one (fewer slots per SKU).
  totalWeight += WEIGHTS.fillExisting;
  if (qty > 0 && (slotHasSku || occ?.productIds.size === 0)) {
    weighted += WEIGHTS.fillExisting;
  } else if (qty === 0) {
    weighted += WEIGHTS.fillExisting * 0.5; // empty is neutral-good
  }

  const score = totalWeight > 0 ? (weighted / totalWeight) * 100 : 0;
  return { score, reasons };
}

/**
 * Best available slot in each section for a product, then the top sections
 * overall. Distance/category are per-section so we needn't score every bay —
 * we pick the best (bay, level) within a section, then rank sections.
 */
function bestSlotsFor(
  product: ScoredProduct,
  ctx: FacilityCtx,
  limit: number
): SlotSuggestion[] {
  const perSection: SlotSuggestion[] = [];

  for (const section of ctx.sections) {
    let best: { slot: ScoredSlot; score: number; reasons: string[] } | null =
      null;

    for (let level = 1; level <= section.totalLevels; level++) {
      for (let bay = 1; bay <= section.totalBays; bay++) {
        const slot: ScoredSlot = { section, bay, level };
        const scored = scoreSlot(slot, product, ctx);
        if (!scored) continue;
        if (!best || scored.score > best.score) {
          best = { slot, score: scored.score, reasons: scored.reasons };
        }
      }
    }

    if (best) {
      const ref: SlotRef = {
        sectionId: section.id,
        sectionCode: section.code,
        bay: best.slot.bay,
        level: best.slot.level,
      };
      perSection.push({
        slot: ref,
        score: Math.round(best.score),
        reasons: best.reasons,
        label: slotLabel(ref),
      });
    }
  }

  perSection.sort((a, b) => b.score - a.score);
  return perSection.slice(0, limit);
}

// ── Velocity percentiles ──────────────────────────────────────────────────

/** Map productId → percentile rank (0..1) of its velocity within the set. */
function velocityPercentiles(
  velocities: Map<string, number>,
  productIds: string[]
): Map<string, number> {
  const pct = new Map<string, number>();
  const sorted = productIds
    .map((id) => ({ id, v: velocities.get(id) ?? 0 }))
    .sort((a, b) => a.v - b.v);
  const n = sorted.length;
  if (n === 0) return pct;
  sorted.forEach((row, i) => {
    pct.set(row.id, n === 1 ? 0.5 : i / (n - 1));
  });
  return pct;
}

// ── Public: suggestions for one product ───────────────────────────────────

export async function getSlottingSuggestions(
  supabase: Client,
  orgId: string,
  warehouseId: string,
  productId: string,
  opts?: { quantity?: number; limit?: number }
): Promise<SuggestionResult> {
  const limit = opts?.limit ?? 5;
  const ctx = await loadFacilityCtx(supabase, orgId, warehouseId);
  if (!ctx.hasLayout) {
    return { suggestions: [], noLayout: true, noOrigin: !ctx.hasOrigin };
  }

  // Product category for the requested SKU.
  const { data: productRow } = await supabase
    .from("products")
    .select("id, category_id")
    .eq("id", productId)
    .maybeSingle();
  const categoryId =
    (productRow as { category_id: string | null } | null)?.category_id ?? null;

  // Velocity percentile relative to the facility's on-hand products.
  const onHandIds = uniqueOnHandProductIds(ctx);
  const idsForRank = onHandIds.includes(productId)
    ? onHandIds
    : [...onHandIds, productId];
  const velocities = await productVelocities(supabase, {
    productIds: idsForRank,
  });
  const pct = velocityPercentiles(velocities, idsForRank);

  const product: ScoredProduct = {
    id: productId,
    categoryId,
    velocityPct: pct.get(productId) ?? 0.5,
    qtyToPlace: Math.max(1, opts?.quantity ?? 1),
  };

  return {
    suggestions: bestSlotsFor(product, ctx, limit),
    noLayout: false,
    noOrigin: !ctx.hasOrigin,
  };
}

function uniqueOnHandProductIds(ctx: FacilityCtx): string[] {
  const ids = new Set<string>();
  for (const set of ctx.sectionProducts.values()) {
    for (const id of set) ids.add(id);
  }
  return [...ids];
}

// ── Public: facility slotting-health report ───────────────────────────────

export async function getSlottingHealth(
  supabase: Client,
  orgId: string,
  warehouseId: string,
  facilityName: string,
  opts?: { limit?: number }
): Promise<SlottingHealth> {
  const limit = opts?.limit ?? 25;
  const ctx = await loadFacilityCtx(supabase, orgId, warehouseId);

  const base: SlottingHealth = {
    facilityId: warehouseId,
    facilityName,
    totalSlots: ctx.sections.reduce(
      (n, s) => n + s.totalBays * s.totalLevels,
      0
    ),
    occupiedSlots: ctx.occupancy.size,
    misSlottedCount: 0,
    fastMoversFar: 0,
    goldenZoneBlocked: 0,
    categoryMismatches: 0,
    hasOrigin: ctx.hasOrigin,
    hasLayout: ctx.hasLayout,
    misSlots: [],
  };
  if (!ctx.hasLayout) return base;

  // Section lookup + on-hand products with velocity percentiles.
  const sectionById = new Map(ctx.sections.map((s) => [s.id, s]));
  const onHandIds = uniqueOnHandProductIds(ctx);
  if (onHandIds.length === 0) return base;

  const [{ data: productRows }, velocities] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, internal_sku, category_id")
      .eq("org_id", orgId)
      .in("id", onHandIds),
    productVelocities(supabase, { productIds: onHandIds }),
  ]);
  const products = new Map(
    ((productRows ?? []) as Array<{
      id: string;
      name: string | null;
      internal_sku: string | null;
      category_id: string | null;
    }>).map((p) => [p.id, p])
  );
  const pct = velocityPercentiles(velocities, onHandIds);

  // Current placements: a row per (product, slot) it currently occupies.
  const { data: locationRows } = await supabase
    .from("locations")
    .select("product_id, section_id, bay, level")
    .eq("org_id", orgId)
    .eq("warehouse_id", warehouseId)
    .eq("is_active", true);

  const misSlots: MisSlot[] = [];
  let categoryMismatches = 0;
  let fastMoversFar = 0;
  let goldenZoneBlocked = 0;

  // Score-range for the improvement threshold is 0..100.
  const threshold = HEALTH_IMPROVEMENT_THRESHOLD * 100;

  for (const l of (locationRows ?? []) as Array<{
    product_id: string | null;
    section_id: string | null;
    bay: number | null;
    level: number | null;
  }>) {
    if (!l.product_id || !l.section_id || l.bay == null || l.level == null) {
      continue;
    }
    const section = sectionById.get(l.section_id);
    const prod = products.get(l.product_id);
    if (!section || !prod) continue;

    const velocityPct = pct.get(l.product_id) ?? 0.5;
    const velocity = velocities.get(l.product_id) ?? 0;
    const scored: ScoredProduct = {
      id: l.product_id,
      categoryId: prod.category_id,
      velocityPct,
      qtyToPlace: 1,
    };

    // Category mismatch — section has a default category and it disagrees.
    if (
      section.defaultCategory &&
      prod.category_id &&
      section.defaultCategory !== prod.category_id
    ) {
      categoryMismatches++;
    }

    // Golden-zone diagnostics.
    const proximity =
      section.proximityScore != null ? 1 - section.proximityScore : null;
    if (proximity != null) {
      if (velocityPct >= 0.66 && proximity <= 0.4) fastMoversFar++;
      if (velocityPct <= 0.33 && proximity >= 0.66) goldenZoneBlocked++;
    }

    // Compare current slot's score with the best alternative.
    const currentScored = scoreSlot({ section, bay: l.bay, level: l.level }, scored, ctx);
    const currentScore = currentScored?.score ?? 0;
    const [best] = bestSlotsFor(scored, ctx, 1);
    if (!best) continue;

    const gain = best.score - currentScore;
    const sameSlot =
      best.slot.sectionId === l.section_id &&
      best.slot.bay === l.bay &&
      best.slot.level === l.level;

    if (!sameSlot && gain >= threshold) {
      const current: SlotRef & { label: string } = {
        sectionId: section.id,
        sectionCode: section.code,
        bay: l.bay,
        level: l.level,
        label: slotLabel({
          sectionCode: section.code,
          bay: l.bay,
          level: l.level,
        }),
      };
      misSlots.push({
        productId: l.product_id,
        productName: prod.name ?? "Unknown product",
        sku: prod.internal_sku,
        current,
        suggested: best,
        reason: misSlotReason(velocityPct, proximity, section, prod.category_id),
        velocity,
        // Impact: travel-sensitive SKUs with big score gains rise to the top.
        // (velocity + a small floor so zero-velocity but clearly-wrong slots
        // still surface, just below movers.)
        impact: (velocity + 0.05) * gain,
      });
    }
  }

  misSlots.sort((a, b) => b.impact - a.impact);

  return {
    ...base,
    misSlottedCount: misSlots.length,
    fastMoversFar,
    goldenZoneBlocked,
    categoryMismatches,
    misSlots: misSlots.slice(0, limit),
  };
}

function misSlotReason(
  velocityPct: number,
  proximity: number | null,
  section: SectionCtx,
  categoryId: string | null
): string {
  if (proximity != null && velocityPct >= 0.66 && proximity <= 0.4) {
    return "Fast mover stuck in the back";
  }
  if (proximity != null && velocityPct <= 0.33 && proximity >= 0.66) {
    return "Slow mover blocking the golden zone";
  }
  if (
    section.defaultCategory &&
    categoryId &&
    section.defaultCategory !== categoryId
  ) {
    return "Wrong category section";
  }
  return "A better slot is available";
}
