# Putaway / Slotting Suggestions — Implementation Plan (Roadmap #8)

> Status: **planned, not started.** Build the facility-builder polish (§0) FIRST,
> then implement this. This doc is self-contained so a fresh session can execute it.

## What it is

When stock arrives (PO receive) or needs a home, suggest the **best slot** to put
it in — and surface a **slotting-health** report flagging mis-slotted SKUs. "Best"
balances: put fast-movers near the dock/pack-out ("golden zone"), keep a SKU in a
section matching its category, consolidate with existing stock, and respect slot
capacity. This is the classic WMS *directed putaway / slotting optimization*.

---

## 0. PREREQUISITE — polish the facility builder first

> **Status: DONE (2026-05-30).** The polish pass below is complete. Resolved decisions:
> - **Canonical unit:** floor coords are unitless numbers, **top-left origin, 1 coord = 1 unit**.
>   `warehouses.floor_unit` ('ft' default, 'm' optional) is an **interpretive label only** —
>   switching it relabels, it does NOT rescale geometry. Builder has a ft/m toggle
>   (`setFloorUnit` in `builder/actions.ts`).
> - **Source of truth:** the normalized `sections` + `layout_elements` tables (app schema).
>   `warehouses.layout_json` does **not** exist as a live source; only `layout_snapshots.layout_json`
>   (versioned backups). The engine reads the tables. (Resolves Open decision #1.)
> - **Rotation** is applied in 2D/3D rendering and is consistent across viewers; centroid distance
>   (with rotation) is the v1 metric. Overlap detection (`builder/overlap.ts`, SAT/OBB) now **blocks
>   saving** while sections overlap, keeping geometry trustworthy for slotting.
> - **Door anchor:** `createWarehouse` seeds a default `kind='door'` ("Receiving") element so every
>   facility has a travel-distance origin; the builder shows a nudge if none exists.
> - **Capacity:** `sections.slot_capacity int null` shipped (migration `app_sections_slot_capacity`).
>   Editable in the section inspector; the section-detail slot grid shows per-slot fullness / full /
>   over. NULL = unlimited (soft factor). (Resolves Open decision #2 → `sections.slot_capacity`.)
> - Also done: undo/redo now persists across reload (sessionStorage per warehouse); snapshot restore
>   guards against orphaning `locations` (hard confirm); 3D element fidelity (door footprint, note
>   floor-anchor, walkway visibility).


Slotting math reads the builder's spatial output, so the layout model must be
trustworthy before we score against it. Verify/fix in the builder
(`app/(app)/facilities/[id]/builder/`) and viewer (`FacilityViewer.tsx`,
`FacilityViewer3D.tsx`, `ViewerCanvas.tsx`) BEFORE building #8:

- **Coordinate integrity.** Sections + elements persist `floor_x/y/width/height/rotation`
  (numeric). Confirm units are consistent (same scale for sections and elements),
  origin is stable, and rotation is actually applied in distance math (a rotated rack's
  pick face differs). Decide a canonical unit (feet? grid units?) and document it.
- **Door / staging elements are real anchors.** `layout_elements.kind ∈ {walkway, note,
  door, obstacle, staging}`. Slotting uses `door` (receiving/shipping) and `staging`
  (pack-out) as the "travel-distance" origins. Make sure the builder lets users place
  these and that there's at least one `door` per facility (or a sensible default).
- **Slot grid = source of truth.** `sections.total_bays × total_levels` defines slots;
  `locations(section_id, bay, level, quantity)` is occupancy. Confirm the builder and the
  section-detail slot grid (`facilities/[id]/sections/[sectionId]`) agree on bay/level
  indexing (1-based per existing code) and that `locations` can't reference a bay/level
  outside the section's grid.
- **3D ↔ 2D parity.** The 3D viewer is β and editing is 2D-only (per README). Slotting is
  2D-distance based, so 3D need not be perfect — but confirm the 2D layout the engine
  reads is the authoritative one (`warehouses.layout_json` vs the `sections`/`layout_elements`
  tables — see §2; pick ONE source of truth).
- **Capacity model.** Today a slot's "full" is implicit (it just holds a quantity). Decide
  whether to add a per-slot or per-section capacity (see §3) — slotting needs a notion of
  "is this slot available / how full".
- General builder polish: undo/redo correctness, snap/overlap validation, save reliability,
  mobile inspector. (Pre-existing; out of #8 scope but worth a pass.)

**Open question to resolve in the polish pass:** is the live layout stored in the
normalized `sections` + `layout_elements` tables, or in `warehouses.layout_json` (jsonb),
or both? The builder types (`SectionDraft`, `LayoutElementDraft`) map to the tables. The
engine should read the tables. Confirm `layout_json` isn't a competing source.

---

## 1. Goal & scope

**Phase 1 (suggestion + health, low risk, read-side):**
- A **slotting engine** (`lib/data/slotting.ts`) that, given a product + facility, scores
  candidate slots and returns ranked suggestions with a reason ("near dock · matches
  category · consolidates with 3 units").
- **"Suggest slot"** surfaced at: PO receive (per line), product detail, and the
  section-detail slot grid.
- A **Slotting health** report (`/analytics/slotting` or a section on facilities): SKUs
  whose current slot disagrees with the suggestion (e.g., a fast-mover stuck in the back),
  ranked by impact (velocity × travel distance saved).

**Phase 2 (optional, write-side):** a "Apply suggestion" action that creates/moves the
`locations` row (relocate) — keep physical movement scan-confirmed per the suite's
architecture (mobile does floor scans; the desk suggests + records intent). Mirror the
cycle-count / kit-build mutation pattern if a desk relocate is wanted.

---

## 2. What it builds on (existing schema — all confirmed present)

- `sections`: `id, warehouse_id, code, name, total_bays, total_levels, color,
  default_category (uuid → categories), position_json, sort_order` + builder coords
  `floor_x/y/width/height/rotation` (via `SectionDraft`; confirm these persist on the
  `sections` row vs `position_json`).
- `layout_elements`: `kind, floor_x/y/width/height/rotation, label, data(jsonb)`. Use
  `kind='door'` and `kind='staging'` centroids as travel-distance origins.
- `locations`: `id, product_id, section_id, warehouse_id, bay, level, quantity, is_active`.
  Occupancy / on-hand per slot.
- `products`: `category_id`, `unit_cost`, plus the feature flags added this cycle
  (`track_lots`, `is_kit`, `track_serials`).
- `lib/data/velocity.ts` → `productVelocities(supabase, { productIds })` (60-day pick+adjust
  daily velocity). Drives "fast vs slow mover".
- `scan_history` (movement history) if finer recency is wanted.

## 3. New schema (minimal)

Slotting needs a **capacity** notion. Cheapest option:
- `sections.slot_capacity int null` — max units per slot in this section (null = unlimited /
  unknown → treat capacity as a soft factor, not a hard filter). One additive migration.
- Optional later: a `slotting_rules` table for per-category zone preferences
  (`category_id, warehouse_id, preferred_section_id, priority`) if hand-tuned zoning is
  wanted. Phase 1 can derive zoning from `sections.default_category` instead — no new table.

No other schema needed for Phase 1.

## 4. The slotting engine — scoring

`scoreSlot(product, candidateSlot, context) → { score, reasons[] }`. Candidate slots =
all (section, bay, level) in the facility, minus full/inactive, computed from
`sections.total_bays×total_levels` minus occupied `locations`.

Weighted factors (tune weights in one place):
1. **Category match** (high weight): candidate section's `default_category === product.category_id`.
2. **Consolidation**: an existing slot already holding this product (same SKU) with spare
   capacity → strongly prefer (one SKU, fewer slots).
3. **Velocity ↔ zone (golden zone)**: compute slot→nearest-`door`/`staging` distance from
   floor coords. Normalize products by velocity percentile; **high velocity wants short
   distance**, low velocity is fine far away. Score = how well velocity rank matches
   proximity rank.
4. **Level ergonomics**: lower `level` (floor/waist height) preferred for fast-movers
   (less reach time); high levels for slow/bulk.
5. **Capacity fit**: penalize slots that would overflow `slot_capacity`; prefer slots that
   fit the incoming qty cleanly.
6. **Empty-vs-occupied**: mild preference to fill partially-used compatible slots before
   opening new ones.

Distance helper: section centroid = `(floor_x + floor_width/2, floor_y + floor_height/2)`
(apply rotation if non-trivial); element centroid likewise; Euclidean distance. (A true
aisle/path distance is a later refinement; centroid distance is a fine v1 proxy.)

Return top N (e.g., 5) suggestions, each with human reasons for trust.

## 5. Surfaces

- **PO receive** (`purchase-orders/[id]/ReceiveLineForm.tsx`): a "Suggested slot: A-12-1
  (near dock · matches Flooring)" hint per line; clicking copies it into the (future)
  putaway field or just informs the scanner.
- **Product detail** (`inventory/[id]/page.tsx`): a "Recommended slot" card for products
  with on-hand but no/suboptimal slot.
- **Section detail** (`facilities/[id]/sections/[sectionId]`): when placing a product into a
  bay, show suggested products for empty slots (reverse lookup).
- **Slotting health report** (`/analytics/slotting`, linked from Analytics like Valuation):
  list mis-slotted SKUs ranked by `velocity × distance-saved`; the actionable
  "re-slot these 8 fast-movers" list. Add a "slotting" nav key if desired (industries:
  flooring/manufacturing/3PL benefit).

## 6. Phasing

> **Status (2026-05-31):** 6a + 6b **DONE** on `feat/slotting-suggestions`.
> - `lib/data/slotting.ts` — engine (candidate gen + `scoreSlot` + reasons),
>   `getSlottingSuggestions`, `getSlottingHealth`. Centroid-Euclidean distance to
>   nearest door/staging; proximity factor auto-skips when no origin exists.
> - `/analytics/slotting` — scope-aware health report (KPIs + per-facility ranked
>   "current → suggested" moves), linked from the analytics index.
> - Section `default_category` picker added to the builder (activates the
>   category factor); persisted via saveLayout/restoreSnapshot.
> - §6b inline hints: "Suggested slot" per open line on receivable POs +
>   "Recommended slot" card on product detail.
> - **6c DONE** (`feat/slotting-apply-move`): desk "Apply move" on the health
>   report — `applySlottingMove` does a cross-section relocate of the `locations`
>   row (same-product merge + `relocate` scan_history audit), refreshing the
>   report on success. Consistent with the existing desk relocate/place mutations.
>
> Roadmap #8 (Phases 1 + 2) is now functionally complete.


- **6a** — engine (`lib/data/slotting.ts`) + the **health report** page (read-only; highest
  insight, zero mutation risk). Ship first.
- **6b** — inline "Suggested slot" hints on receive + product detail.
- **6c** (optional) — "Apply / re-slot" write action (relocate `locations`), scan-confirmed
  or a desk relocate mirroring cycle-count adjustments + `scan_history` `relocate` entries.

## 7. Files to create / touch

- NEW `lib/data/slotting.ts` — candidate generation + scoring + `getSlottingSuggestions(...)`
  and `getSlottingHealth(...)`.
- NEW `app/(app)/analytics/slotting/page.tsx` — health report (mirror
  `analytics/valuation/page.tsx` structure: KPIs + ranked table + scope-aware).
- TOUCH `app/(app)/analytics/page.tsx` — add a "Slotting" link next to Valuation/Dead-stock.
- TOUCH `purchase-orders/[id]/ReceiveLineForm.tsx` + its page — surface the per-line suggestion.
- TOUCH `inventory/[id]/page.tsx` — "Recommended slot" card.
- MIGRATION `app_sections_slot_capacity` — `sections.slot_capacity int`.
- (6c) NEW `app/(app)/facilities/.../actions.ts` relocate action, or extend section actions.

## 8. Edge cases & architecture boundary

- Facilities with **no door/staging elements** → skip the proximity factor (fall back to
  category + consolidation + level); surface a hint to add a dock in the builder.
- Facilities with **no sections / no layout** → engine returns "no layout to slot against."
- **Multi-facility**: suggestions are per-facility (scope-aware, like the rest of the app).
- **Physical movement is mobile/scan** (per README: pickers/putaway on the RN app). The desk
  app *suggests* and (optionally, 6c) records intent; it should not silently move stock
  across the floor.
- Performance: candidate slots = Σ(bays×levels) per facility could be large — generate
  lazily / cap, and compute distances once per section (not per slot).

## 9. Open decisions (resolve at kickoff)

1. Single layout source of truth: `sections`+`layout_elements` tables vs `warehouses.layout_json`.
2. Capacity model: `sections.slot_capacity` (simple) vs per-slot capacity vs none (soft factor).
3. ABC/velocity zoning: derive from `sections.default_category` + velocity (no new table) vs a
   `slotting_rules` table for explicit hand-tuned zones.
4. Distance metric: centroid Euclidean (v1) vs aisle/path-aware (later).
5. Does 6c (desk re-slot write) belong in the dashboard, or is it strictly mobile?
