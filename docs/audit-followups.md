# Audit — bugs, edge cases & unfinished features (2026-05-31)

> ## ⚠️ HISTORICAL — this work list is CLOSED. Do not treat it as open work.
>
> This document was written as a work list on 2026-05-31 and said "nothing here is fixed yet."
> That is no longer true and has not been since June. **Every P0 and P1 item below shipped.**
> Re-verified against `main` on **2026-08-14**:
>
> | Finding | Resolution | Verify at |
> |---|---|---|
> | P0-1 `assembleKit` stale-snapshot decrement | `app.assemble_kit` RPC under a per-facility advisory lock | `lib/data/assemble.ts:41` · `20260531150500_app_p0_concurrency_rpcs.sql` |
> | P0-2 Concurrent allocation oversell | `app.allocate_order` RPC under advisory lock | `lib/data/allocation.ts:271` |
> | P0-3 Double work-order completion | `app.complete_work_order` RPC (claimed status transition) | `app/(app)/work-orders/actions.ts:143` |
> | P0-4 `commitAdjustment` lost update | `app.commit_stock_adjustment` RPC | `lib/data/adjustments.ts:174` |
> | P1 RBAC gaps + cross-org write | Fixed; RBAC now also enforced in RLS | `20260715120000_rls_permission_gating.sql` |
> | P1 cancel-after-pick oversell, forecast seasonality, slotting capacity | Fixed | see `lib/data/allocation.ts`, `lib/forecast.ts` |
> | QC quarantine | Shipped in both desk + mobile repos | `20260701123000_allocate_order_exclude_quarantine.sql` |
>
> Kept in the repo because the **fix patterns and the reasoning** below are still the house
> style for stock mutations — read it before touching any read-then-write on quantities.
> For currently-open work see [`audit-2026-08-14.md`](audit-2026-08-14.md).

Post-build audit of the nine features shipped this cycle (slotting, allocation/ATP/backorders,
wave/zone picking, multi-level BOM + work orders, receiving QC, adjustment reasons + approvals,
demand forecasting, custom reports, granular RBAC). All merged to `main`. Findings verified
against real code with file:line.

Severity: **P0** = data corruption / overselling / security · **P1** = correctness · **P2** = quality/perf · **P3** = polish.

---

## P0 — Concurrency on stock mutations (systemic)

Every stock mutation does **read-then-write with no row lock, transaction, or optimistic guard**
(the untyped Supabase client issues independent REST calls). This is the single biggest risk.

1. **`assembleKit` stale-snapshot decrement → negative stock.** `lib/data/assemble.ts:69-96`
   validates sufficiency against a snapshot read, then writes `quantity: have - take` using the
   **stale `have`**. Two concurrent builds (or build + cycle-count) both pass validation and
   last-write-wins → location goes negative, stock over-consumed. Reached by `completeWorkOrder`
   (`work-orders/actions.ts`) and `buildKit` (`kits/actions.ts`).
2. **Concurrent allocation oversell.** `lib/data/allocation.ts:387-418` (`allocateOrderInternal`)
   reads ATP → writes `quantity_allocated`. Fires on every `createOrder` (auto-allocate). Two
   orders for the same SKU each subtract the same ATP → combined allocation exceeds on-hand.
3. **Double work-order completion double-consumes.** `work-orders/actions.ts` `completeWorkOrder`:
   the `WO_OPEN_STATUSES` check and the later `status='complete'` write are a read-then-write race;
   two concurrent completes both run `assembleKit`.
4. **`commitAdjustment` lost-update.** `lib/data/adjustments.ts:163-184` blind `update({quantity})`
   not conditioned on prior qty; concurrent edits silently clobber.

**Fix pattern:** move stock decrements into atomic conditional updates
(`update ... set quantity = quantity - :n where id = :id and quantity >= :n`, check rowcount) and
claimed status transitions (`update ... set status='complete' where status in (...) returning`),
ideally inside Postgres RPCs/transactions or guarded by advisory locks per (org, warehouse, product).

---

## P0/P1 — ATP correctness assumption (must verify against mobile app)

`ATP = on_hand − Σ max(0, allocated − picked)` (`lib/data/allocation.ts:14-16`). The `− picked`
term is correct **only if physically picking decrements `locations.quantity`**. Picking + the
on-hand decrement happen in the **mobile app (separate repo)**; this repo never writes
`quantity_picked` after order creation (`shopify/ingest.ts` sets it to 0). If picking bumps
`quantity_picked` but does **not** decrement on-hand, ATP **double-counts** the pick and
**oversells** progressively. **Action:** verify the mobile contract; ideally compute ATP without
depending on an external decrement, or ensure picking writes both fields in one transaction.

---

## P1 — RBAC enforcement gaps (permissions are cosmetic on most actions)

The 17 permissions exist and the member editor can toggle them, but most mutating actions call
`getActionContext()` and **never call `ctx.can()`**. Because member defaults grant these, the gap
is invisible until an admin revokes a permission — then the member **can still do it**. Add
`if (!ctx.can("<perm>")) return ...` to each:

| Action | File | Expected perm |
|---|---|---|
| createOrder / advanceOrderStatus / cancelOrder | `orders/actions.ts` | `orders.manage` |
| allocateOrder / fillBackorders | `orders/actions.ts` | `orders.allocate` |
| createPurchaseOrder / draftReorderPO / markPoSent / markPoCancelled | `purchase-orders/actions.ts` | `purchasing.manage` |
| receiveLineItem | `purchase-orders/actions.ts` | `purchasing.receive` |
| reviewQcLine | `receiving/actions.ts` | `qc.review` |
| buildWave / autoBuildWave / setWaveStatus / claimWave / removeOrderFromWave | `picking/actions.ts` | `picking.manage` |
| createWorkOrder / setWorkOrderStatus / completeWorkOrder / claimWorkOrder | `work-orders/actions.ts` | `work_orders.manage` |
| buildKit | `kits/actions.ts` | `work_orders.manage` |
| saveReport / deleteReport | `reports/actions.ts` | `reports.manage` |
| placeLocation / updateLocationQuantity / removeLocation / relocateLocation | `facilities/[id]/sections/[sectionId]/actions.ts` | `inventory.adjust` |
| createProduct | `inventory/actions.ts` | `inventory.manage` (note: bulk import IS gated, single-create is NOT) |

Modules with **no permission defined at all** (outside RBAC entirely): customers, suppliers, lots,
serials, kit BOM editing, `recordCycleCount` (mutates on-hand but ungated; only `cycle_counts.void`
is enforced). Decide whether to bring these under RBAC.

---

## P1 — Cross-org write bug (multi-workspace users)

Several action files keep a **local `getOrgContext()`** that queries `org_members ... .limit(1)
.maybeSingle()` with **no workspace-cookie filter** — so writes resolve `orgId` from an arbitrary
"first" membership while reads (via `getCurrentOrgContext`) follow the cookie. Affected:
`facilities/actions.ts`, `facilities/[id]/builder/actions.ts`,
`facilities/[id]/sections/[sectionId]/actions.ts`, `settings/actions.ts`, `analytics/slotting/actions.ts`.
The `sections/*` ones are worst (write wrong `org_id` into `locations`/`scan_history`).
**Fix:** route all through the cookie-aware `getActionContext()` (also gives `ctx.can`).

---

## P1 — Feature-specific correctness

- **Approval clobbers concurrent changes (and the comment lies).** `adjustments.ts:247-288`
  `approveAdjustmentInternal` claims to "re-read live qty" but writes the stale `requested_qty`
  captured at submit time → overwrites any pick/adjust since submission; audit delta is wrong.
  **Fix:** re-read `locations.quantity` at approval; recompute delta or reject on drift.
- **QC holds nothing.** `purchase-orders/actions.ts` `receiveLineItem` never creates on-hand;
  `qc_status` is a PO-line label. Held/failed lines don't block putaway/pick. Partial re-receipts
  keep stale `qc_status` (new units inherit old verdict). To be a real quarantine: land received
  goods in a quarantine state and exclude from ATP/availability. `reviewQcLine` also lacks a
  permission check and scopes the line by `id` only.
- **Allocation staleness.** No re-allocation on order-item edits; `cancelOrder` +
  `releaseOrderAllocationInternal` blanket-sets `allocated=0` ignoring `picked` → oversell when a
  partially-picked order is cancelled. **Fix:** clamp release to `picked`; re-allocate on edits;
  block/handle cancel after picking starts.
- **Forecast seasonality misfires.** `lib/forecast.ts:98` `max/(min||1) >= 1.5` falsely flags
  seasonality when any weekday is 0 (common for low-volume SKUs). **Fix:** require all
  `counts[d] > 0`, use coefficient-of-variation.
- **Forecast worklist perf.** `lib/data/forecast.ts` `getForecastWorklist` runs `buildForecast`
  per product on every page render with no cache + a 90-day `scan_history` pull. **Fix:**
  `unstable_cache` + tag, or pre-aggregate demand in SQL.
- **Slotting apply ignores capacity + non-transactional merge.** `analytics/slotting/actions.ts`
  `applySlottingMove` validates bay/level bounds but not `sections.slot_capacity`; the merge is two
  un-transacted updates (double-count risk if the source-deactivate fails after the target-merge).

---

## P2 — Quality / perf / consistency

- **`explodeBom` is dead code.** `lib/data/bom.ts` defines it but nothing calls it. Work orders
  snapshot only the **direct** BOM and `assembleKit` consumes only direct components — so
  multi-level builds are NOT actually supported (sub-assemblies must be pre-built). Either wire
  `explodeBom` into planning or delete it (it implies a capability that doesn't exist).
- **`assembleKit` omits `is_active` filter** on the locations read (`assemble.ts:48`) — inconsistent
  with everywhere else; can consume/produce inactive locations.
- **Report inventory dataset** (`lib/data/reports.ts` `runInventory`) loads ALL products + ALL
  locations, filters in JS; PostgREST's 1000-row cap may **silently truncate** → wrong on-hand
  totals; `runInventory` also ignores `opts.limit` so CSV export isn't bounded by `EXPORT_LIMIT`.
- **Adjustment threshold** strict `>` lets the boundary value through; threshold `0` is silently
  dropped (can't mean "gate everything").
- **Manual grid edits have no reason picker** (`SectionDetail.tsx` → `updateLocationQuantity` sends
  `reasonCode: null`) — controlled vocabulary unmet for manual adjustments; reason-requires-approval
  never triggers there.
- **`setMemberPermissions`** lets an admin strip a fellow admin to `[]` (no admin-vs-admin guard);
  submitting the editor with all boxes off writes `[]` = full lockout (owners are protected).
- **Facilities edit UI** (`facilities/[id]/page.tsx`) still gated by role, not
  `facilities.manage` — a granted member won't see the affordance.
- **Number generation races** for `ORD-`/`PO-`/`WO-`/`WAVE-` (read-max + 1, no atomicity); `ORD`
  uses `created_at` ordering which can mis-pick the latest number.
- **Forecast** DST/local-timezone day bucketing drift; stored `lead_time_days = 0` → ROP 0.

---

## P3 — Polish

- **CSV formula injection:** `reports/[id]/export/route.ts` `csvCell` quotes for delimiters but
  doesn't neutralize leading `= + - @` (Excel/Sheets formula execution). Prefix risky cells.
- **`Infinity` distance sentinel** in `picking.ts` serializes to `null` if a `WaveDetail` ever
  reaches a client component; use a finite sentinel or `located` boolean.
- **BOM depth** truncation at `MAX_DEPTH` is silent (no `truncated` flag).
- Slotting `occupiedSlots` undercounts (drops coord-less locations); dead fill-existing branch.

---

## Unfinished / not-built features

> 2026-07-03 update: everything in this section has since SHIPPED — the Shopify
> client is a real HMAC-verified HTTP client, multi-level builds auto-explode via
> `app.consume_for_build`, QC quarantine holds stock out of availability, and
> ASN/LPN receiving is live under /inbound. Kept for historical context.

- **Shopify Admin API client** — still a stub (`lib/integrations/shopify/client.ts`); HMAC verify
  returns false, methods error. (See `memory/wip-stubs-to-implement.md`.)
- **Multi-level BOM builds** — only direct-component consumption is implemented; `explodeBom`
  unwired. True multi-level build (auto-explode sub-assemblies) not done.
- **QC real quarantine** — current QC is a workflow gate; doesn't hold stock out of availability.
- **Receiving depth remainder** — **ASN** (advance ship notice) and **LPN / pallet** (license-plate
  handling units) never built.
- **RBAC completion** — enforce the cosmetic permissions (table above); bring customers/suppliers/
  lots/serials/cycle-count-record under RBAC; switch role-based UI gates to permission-based.
- **Slotting** — rotation-aware pick-face distance; aisle/path distance (v1 is centroid Euclidean).
- **Integrations/syncs (explicitly deferred):** shipping/carrier (labels, rates, tracking),
  marketplace/channel sync, accounting (QuickBooks/Xero).

### Data-setup notes (not bugs — limit feature value until done)
- Existing facilities (Atlanta/Chicago) have **no dock door** and **no section categories/zones** →
  slotting golden-zone + wave zones + category factor stay inert until configured. New facilities
  auto-seed a door.
- Existing open orders predate allocation → all show as backordered until `allocateOrder` runs
  (left intentionally; a one-time backfill was offered and declined).
