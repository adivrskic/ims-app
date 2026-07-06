import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerLink, CornerButton } from "@/components/ui/CornerButton";
import { ProductDetailRealtime } from "@/components/realtime/PageRealtime";
import { formatCurrency } from "@/lib/dashboard";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getActiveScope } from "@/lib/facilityScope";
import { getSlottingSuggestions } from "@/lib/data/slotting";
import { getProductAllocationOrgWide } from "@/lib/data/allocation";
import { getProductForecast } from "@/lib/data/forecast";
import { applyForecastSettings } from "@/app/(app)/analytics/forecast/actions";
import { productVelocity } from "@/lib/data/velocity";
import { daysToStockout } from "@/lib/replenishment";
import { expiryStatus, expiryLabel } from "@/lib/lots";
import type { ScanAction } from "@/types/db";
import { PrintLabelButton } from "@/components/print/PrintLabelButton";
import { productLabel } from "@/lib/print/zplTemplates";
import {
  Activity,
  FileText,
  Hash,
  Layers,
  Plus,
  ChevronRight,
} from "lucide-react";

const SCAN_LABEL: Record<ScanAction, string> = {
  register: "Registered",
  locate: "Located",
  relocate: "Relocated",
  pick: "Picked",
  receive: "Received",
  return: "Returned",
  cycle_count: "Counted",
  adjust: "Adjusted",
  putaway: "Put away",
  transfer: "Transferred",
};

const SCAN_TONE: Record<
  ScanAction,
  "neutral" | "success" | "warning" | "info" | "accent" | "danger"
> = {
  register: "success",
  locate: "info",
  relocate: "warning",
  pick: "accent",
  receive: "success",
  return: "danger",
  cycle_count: "neutral",
  adjust: "neutral",
  putaway: "success", // first placement → success, mirrors receive
  transfer: "warning", // cross-facility move → warning, mirrors relocate
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  // Main product + locations + supplier (existing)
  const { data: product, error } = await supabase
    .from("products")
    .select(
      `
      id, name, barcode, internal_sku, manufacturer, weight, dimensions,
      notes, photo_url, reorder_point, created_at, updated_at,
      unit_cost, lead_time_days, safety_stock, preferred_supplier_id,
      category:categories ( id, name ),
      preferred_supplier:suppliers!products_preferred_supplier_id_fkey (
        id, name, email, phone, default_lead_time_days
      ),
      locations:locations ( id, quantity, bay, level, placed_at,
        section:sections ( code, name ),
        warehouse:warehouses ( id, name )
      )
    `
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !product) notFound();

  // Recent scans + lots + recent cycle counts in parallel
  const [
    { data: scans },
    { data: lots },
    { data: poLines },
    { data: pickedLines },
    { data: cycleCounts },
  ] = await Promise.all([
    supabase
      .from("scan_history")
      .select("id, action, scanned_at, quantity, notes")
      .eq("product_id", id)
      .order("scanned_at", { ascending: false })
      .limit(20),
    supabase
      .from("lots")
      .select(
        `id, lot_number, received_at, expires_at, notes,
         supplier:suppliers ( id, name )`
      )
      .eq("product_id", id)
      .order("received_at", { ascending: false, nullsFirst: false })
      .limit(20),
    // Aggregate received quantity per lot via po_line_items
    supabase
      .from("po_line_items")
      .select("lot_id, quantity_received")
      .eq("product_id", id)
      .not("lot_id", "is", null),
    // Aggregate picked quantity per lot via order_items (lot consumption)
    supabase
      .from("order_items")
      .select("lot_id, quantity_picked")
      .eq("product_id", id)
      .not("lot_id", "is", null),
    supabase
      .from("cycle_counts")
      .select(
        "id, expected_qty, counted_qty, variance, status, counted_at, notes"
      )
      .eq("product_id", id)
      .order("counted_at", { ascending: false })
      .limit(5),
  ]);

  const category = Array.isArray(product.category)
    ? product.category[0]
    : product.category;
  const supplier = Array.isArray(product.preferred_supplier)
    ? product.preferred_supplier[0]
    : product.preferred_supplier;

  const totalStock = (product.locations ?? []).reduce(
    (sum: number, l: { quantity: number | null }) => sum + (l.quantity ?? 0),
    0
  );

  // Depletion forecast (§2a). Velocity comes from the shared helper — the
  // same 60-day pick+adjust window draftReorderPO uses — so on-hand and
  // velocity are scoped identically (both org-wide here) and the math lines
  // up with the reorder logic. daysToStockout returns null when there's no
  // demand signal, which we render as a plain-language state rather than ∞.
  const velocity = await productVelocity(supabase, id);
  const daysLeft = daysToStockout({ onHand: totalStock, velocity });

  // Recommended slot (#8 / §6b). Slotting is per-facility, so we pick a target:
  // the active-scope facility if one is selected, else the facility where this
  // product holds the most stock. We then suggest the best slot there and note
  // when the product is already optimally placed.
  type LocLite = {
    bay: number | null;
    level: number | null;
    quantity: number | null;
    section: { code: string | null } | { code: string | null }[] | null;
    warehouse: { id: string; name: string } | { id: string; name: string }[] | null;
  };
  const locsForSlot = (product.locations ?? []) as LocLite[];
  const oneOf = <T,>(v: T | T[] | null): T | null =>
    Array.isArray(v) ? v[0] ?? null : v;

  const [orgCtx, activeScope] = await Promise.all([
    getCurrentOrgContext(),
    getActiveScope(),
  ]);

  // Per-facility on-hand for this product + current slot labels.
  const facilityAgg = new Map<
    string,
    { name: string; qty: number; labels: Set<string> }
  >();
  for (const loc of locsForSlot) {
    const wh = oneOf(loc.warehouse);
    if (!wh) continue;
    const sec = oneOf(loc.section);
    const entry =
      facilityAgg.get(wh.id) ?? { name: wh.name, qty: 0, labels: new Set<string>() };
    entry.qty += loc.quantity ?? 0;
    if (sec?.code && loc.bay != null && loc.level != null) {
      entry.labels.add(
        `${sec.code.trim()}-${String(loc.bay).padStart(2, "0")}-${loc.level}`
      );
    }
    facilityAgg.set(wh.id, entry);
  }

  let targetFacilityId: string | null = null;
  let targetFacilityName = "";
  if (activeScope.mode === "single") {
    targetFacilityId = activeScope.id;
    targetFacilityName = activeScope.name;
  } else {
    let bestQty = -1;
    for (const [fid, agg] of facilityAgg) {
      if (agg.qty > bestQty) {
        bestQty = agg.qty;
        targetFacilityId = fid;
        targetFacilityName = agg.name;
      }
    }
  }

  let recommendedSlot:
    | { label: string; reasons: string[]; alreadyThere: boolean; facility: string }
    | null = null;
  if (orgCtx && targetFacilityId) {
    const r = await getSlottingSuggestions(
      supabase,
      orgCtx.orgId,
      targetFacilityId,
      id,
      { limit: 1, quantity: Math.max(1, facilityAgg.get(targetFacilityId)?.qty ?? 1) }
    );
    const top = r.suggestions[0];
    if (top) {
      const currentLabels = facilityAgg.get(targetFacilityId)?.labels ?? new Set();
      recommendedSlot = {
        label: top.label,
        reasons: top.reasons,
        alreadyThere: currentLabels.has(top.label),
        facility: targetFacilityName,
      };
    }
  }

  // Allocation / ATP (workspace-wide: on-hand aggregates all facilities, so we
  // sum allocations across all open orders too).
  const allocation = orgCtx
    ? await getProductAllocationOrgWide(supabase, orgCtx.orgId, id)
    : { allocated: 0, backordered: 0 };
  const available = Math.max(0, totalStock - allocation.allocated);

  const unitCostNum =
    product.unit_cost == null ? null : parseFloat(String(product.unit_cost));
  const inventoryValue = unitCostNum != null ? unitCostNum * totalStock : null;

  const effectiveLeadTime =
    product.lead_time_days ?? supplier?.default_lead_time_days ?? null;

  // Statistical demand forecast (trend + seasonality + service-level safety
  // stock) over the last 90 days, used to suggest reorder settings.
  const forecast = orgCtx
    ? await getProductForecast(supabase, orgCtx.orgId, id, {
        leadTimeDays: effectiveLeadTime ?? 7,
      })
    : null;

  // Build received-qty-per-lot map for the lots section
  const receivedByLot = new Map<string, number>();
  for (const l of (poLines ?? []) as Array<{
    lot_id: string | null;
    quantity_received: number | null;
  }>) {
    if (!l.lot_id) continue;
    receivedByLot.set(
      l.lot_id,
      (receivedByLot.get(l.lot_id) ?? 0) + (l.quantity_received ?? 0)
    );
  }

  // Picked-per-lot (lot consumption, set by the picker). Lot on-hand is the
  // received − picked ledger — a derived quantity that never touches the
  // location-level on-hand store, so peripheral stock paths stay lot-agnostic.
  const pickedByLot = new Map<string, number>();
  for (const l of (pickedLines ?? []) as Array<{
    lot_id: string | null;
    quantity_picked: number | null;
  }>) {
    if (!l.lot_id) continue;
    pickedByLot.set(
      l.lot_id,
      (pickedByLot.get(l.lot_id) ?? 0) + (l.quantity_picked ?? 0)
    );
  }
  const onHandByLot = (lotId: string) =>
    Math.max(0, (receivedByLot.get(lotId) ?? 0) - (pickedByLot.get(lotId) ?? 0));

  type LotRow = {
    id: string;
    lot_number: string;
    received_at: string | null;
    expires_at: string | null;
    notes: string | null;
    supplier:
      | { id: string; name: string }
      | { id: string; name: string }[]
      | null;
  };
  const lotRows = (lots ?? []) as LotRow[];

  // FEFO ordering: earliest expiry first (lots with no expiry sort last). The
  // first non-expired lot that still has received stock is the suggested pick.
  const fefoLots = [...lotRows].sort((a, b) => {
    if (a.expires_at && b.expires_at) {
      return a.expires_at < b.expires_at ? -1 : a.expires_at > b.expires_at ? 1 : 0;
    }
    if (a.expires_at) return -1;
    if (b.expires_at) return 1;
    return 0;
  });
  const fefoPickId =
    fefoLots.find(
      (l) =>
        l.expires_at &&
        onHandByLot(l.id) > 0 &&
        expiryStatus(l.expires_at) !== "expired"
    )?.id ?? null;

  type CycleCountRow = {
    id: string;
    expected_qty: number;
    counted_qty: number;
    variance: number;
    status: "recorded" | "adjusted" | "voided";
    counted_at: string;
    notes: string | null;
  };
  const cycleCountRows = (cycleCounts ?? []) as CycleCountRow[];

  return (
    <div className="flex flex-col gap-48">
      <ProductDetailRealtime productId={product.id} />

      <PageHeader
        backHref="/inventory"
        backLabel="All inventory"
        eyebrow={`Inventory · ${product.barcode}`}
        title={product.name}
        actions={
          <div className="flex items-center gap-10">
            <PrintLabelButton
              zpl={productLabel({
                productName: product.name,
                barcode: product.barcode,
                sku: product.internal_sku,
                category:
                  (Array.isArray(product.category)
                    ? product.category[0]
                    : product.category
                  )?.name ?? null,
                location:
                  product.locations && product.locations[0]
                    ? `${
                        (Array.isArray(product.locations[0].section)
                          ? product.locations[0].section[0]
                          : product.locations[0].section
                        )?.code ?? "?"
                      }-${product.locations[0].bay}-${
                        product.locations[0].level
                      }`
                    : null,
              })}
              label="Print shelf label"
            />
            {/* Browser-print fallback: works everywhere (no WebUSB/Zebra
                needed) and doubles as a PDF export for Zebra owners. */}
            <CornerLink
              href={`/inventory/${product.id}/labels`}
              variant="ghost"
              size="sm"
              ariaLabel="Printable label sheet"
            >
              <FileText size={11} strokeWidth={1.5} />
              Label sheet
            </CornerLink>
            <CornerLink
              href={`/cycle-counts?product=${product.id}`}
              variant="ghost"
              size="sm"
            >
              <Plus size={11} strokeWidth={1.5} /> New count
            </CornerLink>
            {category && (
              <Badge tone="accent" variant="filled">
                {category.name}
              </Badge>
            )}
          </div>
        }
      />

      <section
        aria-labelledby="kpi-heading"
        className="grid grid-cols-2 md:grid-cols-4 gap-16"
      >
        <h2 id="kpi-heading" className="sr-only">
          Product metrics
        </h2>
        <KpiCard
          label="Units on hand"
          value={totalStock.toLocaleString()}
          delta={
            allocation.allocated > 0
              ? {
                  value: `${allocation.allocated.toLocaleString()} allocated`,
                  direction: "flat",
                  tone: "neutral",
                }
              : undefined
          }
        />
        <KpiCard
          label="Available (ATP)"
          value={available.toLocaleString()}
          delta={
            allocation.backordered > 0
              ? {
                  value: `${allocation.backordered.toLocaleString()} backordered`,
                  direction: "down",
                  tone: "bad",
                }
              : undefined
          }
        />
        <KpiCard
          label="Inventory value"
          value={inventoryValue != null ? formatCurrency(inventoryValue) : "—"}
        />
        <KpiCard
          label="Reorder point"
          value={(product.reorder_point ?? 0).toLocaleString()}
        />
      </section>

      <section
        aria-labelledby="details-heading"
        className="grid grid-cols-1 lg:grid-cols-3 gap-24"
      >
        <h2 id="details-heading" className="sr-only">
          Product details
        </h2>

        <article className="lg:col-span-2 hairline bg-[var(--surface)] p-24">
          <p className="label-text--lg mb-16">Specification</p>
          <dl className="grid grid-cols-2 gap-x-32 gap-y-16">
            <Detail label="Barcode" value={product.barcode} mono />
            <Detail label="Internal SKU" value={product.internal_sku} mono />
            <Detail label="Manufacturer" value={product.manufacturer} />
            <Detail label="Weight" value={product.weight} mono />
            <Detail label="Dimensions" value={product.dimensions} mono />
            <Detail
              label="Created"
              value={
                product.created_at
                  ? new Date(product.created_at).toLocaleString()
                  : null
              }
              mono
            />
          </dl>

          <p className="label-text--lg mt-32 mb-16">Replenishment &amp; cost</p>
          <dl className="grid grid-cols-2 gap-x-32 gap-y-16">
            <Detail
              label="Unit cost"
              value={unitCostNum != null ? `$${unitCostNum.toFixed(2)}` : null}
              mono
            />
            <Detail
              label="Lead time"
              value={
                effectiveLeadTime != null
                  ? `${effectiveLeadTime} days${
                      product.lead_time_days == null && supplier
                        ? " (supplier default)"
                        : ""
                    }`
                  : null
              }
              mono
            />
            <Detail
              label="Safety stock"
              value={
                product.safety_stock != null
                  ? product.safety_stock.toLocaleString()
                  : null
              }
              mono
            />
            <Detail label="Preferred supplier" value={supplier?.name ?? null} />
            <Detail
              label="Demand velocity"
              value={velocity > 0 ? `${velocity.toFixed(2)} / day` : null}
              mono
            />
            <Detail
              label="Days to stockout"
              value={
                daysLeft != null
                  ? `~${daysLeft} ${daysLeft === 1 ? "day" : "days"}`
                  : "no demand signal yet"
              }
              mono
            />
          </dl>

          {forecast && !forecast.empty && (
            <>
              <p className="label-text--lg mt-32 mb-16">Demand forecast</p>
              <dl className="grid grid-cols-2 gap-x-32 gap-y-16">
                <Detail
                  label="Avg demand / day"
                  value={`${forecast.forecast.avgDaily.toFixed(2)}`}
                  mono
                />
                <Detail
                  label="Trend"
                  value={
                    forecast.forecast.trendPerDay > 0.02
                      ? `Rising (+${forecast.forecast.trendPerDay.toFixed(3)}/day)`
                      : forecast.forecast.trendPerDay < -0.02
                      ? `Falling (${forecast.forecast.trendPerDay.toFixed(3)}/day)`
                      : "Flat"
                  }
                  mono
                />
                <Detail
                  label="Seasonality"
                  value={
                    forecast.forecast.seasonality.significant
                      ? `Day-of-week (peaks ${
                          ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
                            forecast.forecast.seasonality.peakDow
                          ]
                        })`
                      : "None detected"
                  }
                  mono
                />
                <Detail
                  label="Forecast over lead time"
                  value={`${Math.ceil(forecast.forecast.forecastLeadTime)} units`}
                  mono
                />
                <Detail
                  label="Suggested reorder point"
                  value={`${forecast.forecast.reorderPoint} (now ${forecast.currentReorderPoint})`}
                  mono
                />
                <Detail
                  label="Suggested safety stock"
                  value={`${forecast.forecast.safetyStock} (now ${forecast.currentSafetyStock})`}
                  mono
                />
              </dl>
              {(forecast.forecast.reorderPoint !== forecast.currentReorderPoint ||
                forecast.forecast.safetyStock !== forecast.currentSafetyStock) && (
                <form action={applyForecastSettings} className="mt-14">
                  <input type="hidden" name="product_id" value={product.id} />
                  <input
                    type="hidden"
                    name="reorder_point"
                    value={forecast.forecast.reorderPoint}
                  />
                  <input
                    type="hidden"
                    name="safety_stock"
                    value={forecast.forecast.safetyStock}
                  />
                  <CornerButton type="submit" variant="ghost" size="sm">
                    Apply suggested settings
                  </CornerButton>
                </form>
              )}
            </>
          )}

          {product.notes && (
            <>
              <p className="label-text--lg mt-32 mb-12">Notes</p>
              <p className="body-text--display whitespace-pre-wrap">
                {product.notes}
              </p>
            </>
          )}
        </article>

        <article className="hairline bg-[var(--surface)] p-24">
          <p className="label-text--lg mb-16">Locations</p>
          {product.locations && product.locations.length > 0 ? (
            <ul className="flex flex-col gap-10">
              {product.locations.map(
                (loc: {
                  id: string;
                  quantity: number | null;
                  bay: number | null;
                  level: number | null;
                  section:
                    | { code: string | null; name: string | null }
                    | { code: string | null; name: string | null }[]
                    | null;
                  warehouse:
                    | { id: string; name: string }
                    | { id: string; name: string }[]
                    | null;
                }) => {
                  const sec = Array.isArray(loc.section)
                    ? loc.section[0]
                    : loc.section;
                  const wh = Array.isArray(loc.warehouse)
                    ? loc.warehouse[0]
                    : loc.warehouse;
                  return (
                    <li
                      key={loc.id}
                      className="hairline-subtle p-12 flex items-center justify-between gap-12 row-interactive"
                    >
                      <div className="min-w-0">
                        <p className="mono-body text-text">
                          {sec?.code?.trim() ?? "?"} · Bay {loc.bay} · L
                          {loc.level}
                        </p>
                        <p className="mono-sm text-text-muted truncate">
                          {wh?.name ?? "Unknown facility"}
                          {sec?.name && ` · ${sec.name}`}
                        </p>
                      </div>
                      <span className="mono-body text-text tnum">
                        {(loc.quantity ?? 0).toLocaleString()}
                      </span>
                    </li>
                  );
                }
              )}
            </ul>
          ) : (
            <p className="mono-sm text-text-dim">
              Not placed in any location yet.
            </p>
          )}

          {recommendedSlot && (
            <div className="hairline-t mt-16 pt-16">
              <p className="label-text text-text-muted mb-8">Recommended slot</p>
              {recommendedSlot.alreadyThere ? (
                <p className="mono-sm text-[var(--success)]">
                  Optimally slotted at {recommendedSlot.label}
                  <span className="text-text-dim"> · {recommendedSlot.facility}</span>
                </p>
              ) : (
                <>
                  <p className="mono-body text-[var(--accent)]">
                    {recommendedSlot.label}
                    <span className="text-text-dim mono-sm">
                      {" · "}
                      {recommendedSlot.facility}
                    </span>
                  </p>
                  {recommendedSlot.reasons.length > 0 && (
                    <p className="mono-sm text-text-muted mt-4">
                      {recommendedSlot.reasons.slice(0, 3).join(" · ")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </article>
      </section>

      {/* P4: Lots received */}
      <section aria-labelledby="lots-heading">
        <SectionTitle
          eyebrow="Provenance · FEFO"
          title="Lots received"
          action={
            lotRows.length > 0 ? (
              <span className="label-text text-text-muted">
                Earliest expiry first
              </span>
            ) : undefined
          }
        />
        {lotRows.length === 0 ? (
          <EmptyState
            title="No lots recorded yet"
            description="When this product is received with a lot or dye-lot number entered on the PO, it'll appear here. Useful for matching dye-lots across customer orders."
            icon={<Hash size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>Lot #</Th>
                  <Th>Supplier</Th>
                  <Th>Received</Th>
                  <Th>Expires</Th>
                  <Th align="right">On hand</Th>
                </tr>
              </thead>
              <tbody>
                {fefoLots.map((lot) => {
                  const sup = Array.isArray(lot.supplier)
                    ? lot.supplier[0]
                    : lot.supplier;
                  const onHand = onHandByLot(lot.id);
                  const status = expiryStatus(lot.expires_at);
                  const isFefo = lot.id === fefoPickId;
                  return (
                    <tr key={lot.id} className="hairline-b last:border-b-0">
                      <Td>
                        <div className="flex items-center gap-8">
                          <code
                            className="mono-body text-text"
                            style={{ fontSize: 12 }}
                          >
                            {lot.lot_number}
                          </code>
                          {isFefo && (
                            <span
                              className="bg-[var(--accent-dim)] text-[var(--accent)] px-6 py-1 shrink-0"
                              style={{
                                fontFamily: "var(--mono)",
                                fontSize: 8,
                                letterSpacing: "0.5px",
                                textTransform: "uppercase",
                              }}
                              title="First-expiring lot with stock — pick this first (FEFO)"
                            >
                              Pick first
                            </span>
                          )}
                        </div>
                      </Td>
                      <Td>
                        {sup ? (
                          <Link
                            href={`/settings/suppliers/${sup.id}`}
                            className="text-text-secondary hover:text-[var(--accent)] transition-colors mono-sm"
                          >
                            {sup.name}
                          </Link>
                        ) : (
                          <span className="mono-sm text-text-dim">—</span>
                        )}
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-secondary">
                          {lot.received_at
                            ? new Date(lot.received_at).toLocaleDateString(
                                undefined,
                                {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                }
                              )
                            : "—"}
                        </span>
                      </Td>
                      <Td>
                        <span
                          className="mono-sm"
                          style={{
                            color:
                              status === "expired"
                                ? "var(--danger)"
                                : status === "soon"
                                ? "var(--warning)"
                                : "var(--text-secondary)",
                          }}
                          title={lot.expires_at ? expiryLabel(lot.expires_at) : undefined}
                        >
                          {lot.expires_at
                            ? new Date(
                                lot.expires_at + "T00:00:00"
                              ).toLocaleDateString(undefined, {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })
                            : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="mono-body text-text tnum">
                          {onHand > 0 ? onHand.toLocaleString() : "—"}
                        </span>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* P4: Cycle count history (summary) */}
      <section aria-labelledby="cycle-counts-heading">
        <SectionTitle
          eyebrow="Accuracy"
          title="Recent cycle counts"
          action={
            <CornerLink
              href={`/cycle-counts?product=${product.id}`}
              variant="ghost"
              size="sm"
            >
              All counts →
            </CornerLink>
          }
        />
        {cycleCountRows.length === 0 ? (
          <EmptyState
            title="No counts yet"
            description="Cycle counts compare what your records say is on-hand to what's actually on the shelf. Run one whenever you want to verify accuracy."
            icon={<Layers size={20} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {cycleCountRows.map((c) => {
              const isVariance = c.variance !== 0;
              const toneClass = !isVariance
                ? "text-[var(--success)]"
                : c.variance > 0
                ? "text-[var(--info)]"
                : "text-[var(--danger)]";
              return (
                <li key={c.id} className="px-20 py-12 flex items-center gap-16">
                  <span className="mono-sm text-text-dim tnum w-[140px] shrink-0">
                    {new Date(c.counted_at).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="mono-body text-text-secondary">
                      Expected {c.expected_qty.toLocaleString()} · counted{" "}
                      {c.counted_qty.toLocaleString()}
                    </p>
                    {c.notes && (
                      <p className="mono-sm text-text-muted truncate">
                        {c.notes}
                      </p>
                    )}
                  </div>
                  <span className={`mono-body tnum ${toneClass}`}>
                    {c.variance > 0 ? `+${c.variance}` : c.variance}
                  </span>
                  <Badge
                    tone={
                      c.status === "adjusted"
                        ? "warning"
                        : c.status === "voided"
                        ? "neutral"
                        : "success"
                    }
                  >
                    {c.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="scans-heading">
        <SectionTitle eyebrow="History" title="Last 20 scans" />
        {!scans || scans.length === 0 ? (
          <EmptyState
            title="No scans recorded"
            description="This product hasn't been touched on the floor yet."
            icon={<Activity size={24} strokeWidth={1.5} />}
          />
        ) : (
          <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
            {scans.map(
              (scan: {
                id: string;
                action: string;
                scanned_at: string | null;
                quantity: number | null;
                notes: string | null;
              }) => {
                const action = scan.action as ScanAction;
                return (
                  <li
                    key={scan.id}
                    className="px-20 py-16 flex items-center gap-16 row-interactive"
                  >
                    <time
                      className="mono-sm text-text-dim tnum w-[120px] shrink-0"
                      dateTime={scan.scanned_at ?? undefined}
                    >
                      {scan.scanned_at
                        ? new Date(scan.scanned_at).toLocaleString()
                        : "—"}
                    </time>
                    <span
                      className="w-px h-12 bg-[var(--border-subtle)] shrink-0"
                      aria-hidden
                    />
                    <Badge tone={SCAN_TONE[action]} variant="filled">
                      {SCAN_LABEL[action]}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      {scan.quantity != null && (
                        <p className="mono-sm text-text-secondary">
                          qty {scan.quantity}
                        </p>
                      )}
                      {scan.notes && (
                        <p className="mono-sm text-text-muted truncate">
                          {scan.notes}
                        </p>
                      )}
                    </div>
                  </li>
                );
              }
            )}
          </ul>
        )}
      </section>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="label-text mb-6">{label}</dt>
      <dd
        className={`${
          mono ? "mono-body" : "body-text--display"
        } text-text break-words`}
      >
        {value || <span className="text-text-dim">—</span>}
      </dd>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      scope="col"
      className={`px-16 py-10 label-text text-text-muted ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={`px-16 py-12 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}
