import { createClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerLink } from "@/components/ui/CornerButton";
import { ProductDetailRealtime } from "@/components/realtime/PageRealtime";
import { formatCurrency } from "@/lib/dashboard";
import { productVelocity } from "@/lib/data/velocity";
import { daysToStockout } from "@/lib/replenishment";
import type { ScanAction } from "@/types/db";
import { PrintLabelButton } from "@/components/print/PrintLabelButton";
import { productLabel } from "@/lib/print/zplTemplates";
import {
  ArrowLeft,
  Activity,
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

  const unitCostNum =
    product.unit_cost == null ? null : parseFloat(String(product.unit_cost));
  const inventoryValue = unitCostNum != null ? unitCostNum * totalStock : null;

  const effectiveLeadTime =
    product.lead_time_days ?? supplier?.default_lead_time_days ?? null;

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
      <Link
        href="/inventory"
        className="mono-sm text-text-muted hover:text-text inline-flex items-center gap-6 self-start"
      >
        <ArrowLeft size={12} strokeWidth={1.5} /> All inventory
      </Link>

      <PageHeader
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
        <KpiCard label="Units on hand" value={totalStock.toLocaleString()} />
        <KpiCard
          label="Inventory value"
          value={inventoryValue != null ? formatCurrency(inventoryValue) : "—"}
        />
        <KpiCard
          label="Reorder point"
          value={(product.reorder_point ?? 0).toLocaleString()}
        />
        <KpiCard label="Locations" value={product.locations?.length ?? 0} />
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
        </article>
      </section>

      {/* P4: Lots received */}
      <section aria-labelledby="lots-heading">
        <SectionTitle
          eyebrow="Provenance"
          title="Lots received"
          action={
            lotRows.length > 0 ? (
              <span className="label-text text-text-muted">
                {lotRows.length} {lotRows.length === 1 ? "lot" : "lots"} on
                record
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
                  <Th align="right">Total received</Th>
                </tr>
              </thead>
              <tbody>
                {lotRows.map((lot) => {
                  const sup = Array.isArray(lot.supplier)
                    ? lot.supplier[0]
                    : lot.supplier;
                  const received = receivedByLot.get(lot.id) ?? 0;
                  return (
                    <tr key={lot.id} className="hairline-b last:border-b-0">
                      <Td>
                        <code
                          className="mono-body text-text"
                          style={{ fontSize: 12 }}
                        >
                          {lot.lot_number}
                        </code>
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
                        <span className="mono-sm text-text-secondary">
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
                          {received > 0 ? received.toLocaleString() : "—"}
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
