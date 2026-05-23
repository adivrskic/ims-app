import Link from "next/link";
import { PageHeader } from "@/components/ui/PageHeader";
import { KpiCard } from "@/components/ui/KpiCard";
import { Badge } from "@/components/ui/Badge";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { NewCountForm } from "./NewCountForm";
import { Layers, X, ChevronRight } from "lucide-react";
import { CycleCountsRealtime } from "@/components/realtime/PageRealtime";
import { getCurrentOrgContext } from "@/lib/data/user";
import { getCycleCountsPageData } from "@/lib/data/cycleCounts";

export const metadata = { title: "Cycle counts" };

interface SearchParams {
  product?: string;
  variance_only?: string;
}

interface ProductOption {
  id: string;
  name: string;
  barcode: string;
}

interface LocationOption {
  id: string;
  product_id: string;
  bay: number | null;
  level: number | null;
  quantity: number | null;
  section_code: string | null;
  warehouse_name: string | null;
}

export default async function CycleCountsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { product: productParam, variance_only } = await searchParams;
  const varianceOnly = variance_only === "1";

  // All four queries + the location rollup + summary math live in the
  // cross-request cache (lib/data/cycleCounts.ts), keyed by org + product +
  // variance filter and tagged tags.cycleCounts / tags.inventory.
  const ctx = await getCurrentOrgContext();
  const data = ctx
    ? await getCycleCountsPageData(ctx.orgId, {
        productId: productParam ?? null,
        varianceOnly,
      })
    : null;

  const products = (data?.products ?? []) as ProductOption[];
  const locations = (data?.locations ?? []) as LocationOption[];
  const totalCounts = data?.totalCounts ?? 0;
  const totalAdjustments = data?.totalAdjustments ?? 0;
  const accuracyPct = data?.accuracyPct ?? null;
  const netUnits = data?.netUnits ?? 0;

  // Filtered-result list rendering
  type Row = {
    id: string;
    expected_qty: number;
    counted_qty: number;
    variance: number;
    status: "recorded" | "adjusted" | "voided";
    counted_at: string;
    notes: string | null;
    product:
      | { id: string; name: string; barcode: string }
      | { id: string; name: string; barcode: string }[]
      | null;
    location:
      | {
          bay: number | null;
          level: number | null;
          section: { code: string | null } | { code: string | null }[] | null;
          warehouse: { name: string } | { name: string }[] | null;
        }
      | {
          bay: number | null;
          level: number | null;
          section: { code: string | null } | { code: string | null }[] | null;
          warehouse: { name: string } | { name: string }[] | null;
        }[]
      | null;
    counter:
      | { full_name: string | null; email: string | null }
      | { full_name: string | null; email: string | null }[]
      | null;
  };
  const rows = (data?.rows ?? []) as Row[];

  const focusedProduct = productParam
    ? products.find((p) => p.id === productParam) ?? null
    : null;

  return (
    <div className="flex flex-col gap-32">
      <CycleCountsRealtime />
      <PageHeader
        eyebrow="Operate · Accuracy"
        title="Cycle counts"
        description={
          focusedProduct
            ? `Counts and adjustments for ${focusedProduct.name}.`
            : "Record physical counts against system quantity. Variances trigger an inventory adjustment automatically; counts with zero variance prove accuracy."
        }
        meta={[
          {
            label: "Counts on record",
            value: (totalCounts ?? 0).toLocaleString(),
          },
          {
            label: "Accuracy",
            value: accuracyPct == null ? "—" : `${accuracyPct}%`,
            status:
              accuracyPct != null && accuracyPct >= 95 ? "live" : undefined,
          },
        ]}
      />

      {/* Active filter pill — only when a product filter is set via URL */}
      {focusedProduct && (
        <div className="flex items-center gap-8 flex-wrap">
          <span className="hairline-subtle inline-flex items-center gap-6 px-10 py-5 mono-sm border-[var(--accent-deep)] bg-[var(--accent-dim)] text-[var(--accent)]">
            <span>Filtered to: {focusedProduct.name}</span>
            <Link
              href="/cycle-counts"
              aria-label="Clear product filter"
              className="opacity-60 hover:opacity-100 transition-opacity"
            >
              <X size={10} strokeWidth={2} />
            </Link>
          </span>
        </div>
      )}

      <section aria-labelledby="new-count">
        <SectionTitle numeral="01" eyebrow="Record" title="New count" />
        <NewCountForm
          products={products}
          locations={locations}
          initialProductId={focusedProduct?.id ?? null}
        />
      </section>

      <section aria-labelledby="kpis">
        <SectionTitle numeral="02" eyebrow="Health" title="Overall" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-16">
          <KpiCard
            label="Counts on record"
            value={(totalCounts ?? 0).toLocaleString()}
          />
          <KpiCard
            label="Required adjustments"
            value={totalAdjustments.toLocaleString()}
            delta={
              (totalCounts ?? 0) === 0
                ? undefined
                : {
                    value:
                      totalAdjustments === 0
                        ? "Perfect accuracy"
                        : `${Math.round(
                            (totalAdjustments / (totalCounts ?? 1)) * 100
                          )}% had variance`,
                    direction: totalAdjustments === 0 ? "flat" : "down",
                    tone: totalAdjustments === 0 ? "good" : "neutral",
                  }
            }
          />
          <KpiCard
            label="Net units adjusted"
            value={
              netUnits === 0
                ? "0"
                : `${netUnits > 0 ? "+" : ""}${netUnits.toLocaleString()}`
            }
            delta={
              netUnits === 0
                ? undefined
                : {
                    value: netUnits > 0 ? "Surplus" : "Shrinkage",
                    direction: netUnits > 0 ? "up" : "down",
                    tone: netUnits > 0 ? "neutral" : "bad",
                  }
            }
          />
        </div>
      </section>

      <section aria-labelledby="history">
        <SectionTitle
          numeral="03"
          eyebrow="History"
          title={
            focusedProduct
              ? "Counts for this product"
              : varianceOnly
              ? "Counts with variance"
              : "Recent counts"
          }
          action={
            <div className="flex items-center gap-8">
              <Link
                href={
                  productParam
                    ? `/cycle-counts?product=${productParam}`
                    : "/cycle-counts"
                }
                aria-current={!varianceOnly ? "page" : undefined}
                className={`label-text px-10 py-5 hairline-subtle transition-colors ${
                  !varianceOnly
                    ? "text-[var(--accent)] border-[var(--accent)]"
                    : "text-text-muted hover:text-text"
                }`}
              >
                All
              </Link>
              <Link
                href={
                  productParam
                    ? `/cycle-counts?product=${productParam}&variance_only=1`
                    : "/cycle-counts?variance_only=1"
                }
                aria-current={varianceOnly ? "page" : undefined}
                className={`label-text px-10 py-5 hairline-subtle transition-colors ${
                  varianceOnly
                    ? "text-[var(--accent)] border-[var(--accent)]"
                    : "text-text-muted hover:text-text"
                }`}
              >
                Variance only
              </Link>
            </div>
          }
        />
        {rows.length === 0 ? (
          <EmptyState
            title={
              focusedProduct
                ? "No counts for this product yet"
                : varianceOnly
                ? "No variances on record"
                : "No counts recorded yet"
            }
            description={
              focusedProduct
                ? "Use the form above to record the first count for this product."
                : varianceOnly
                ? "Every count taken so far matched system quantity. Healthy."
                : "Counts compare what your records say is on-hand to what's actually on the shelf. Use the form above to record one."
            }
            icon={<Layers size={20} strokeWidth={1.5} />}
          />
        ) : (
          <div className="hairline bg-[var(--surface)] overflow-hidden">
            <table className="w-full" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr className="hairline-b bg-[var(--surface-2)]">
                  <Th>When</Th>
                  <Th>Product</Th>
                  <Th>Location</Th>
                  <Th align="right">Expected</Th>
                  <Th align="right">Counted</Th>
                  <Th align="right">Variance</Th>
                  <Th>Status</Th>
                  <Th>By</Th>
                  <Th align="right" srOnly>
                    Open
                  </Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const product = Array.isArray(row.product)
                    ? row.product[0]
                    : row.product;
                  const loc = Array.isArray(row.location)
                    ? row.location[0]
                    : row.location;
                  const sec = loc
                    ? Array.isArray(loc.section)
                      ? loc.section[0]
                      : loc.section
                    : null;
                  const wh = loc
                    ? Array.isArray(loc.warehouse)
                      ? loc.warehouse[0]
                      : loc.warehouse
                    : null;
                  const counter = Array.isArray(row.counter)
                    ? row.counter[0]
                    : row.counter;
                  const varianceTone =
                    row.variance === 0
                      ? "text-[var(--success)]"
                      : row.variance > 0
                      ? "text-[var(--info)]"
                      : "text-[var(--danger)]";
                  return (
                    <tr key={row.id} className="hairline-b last:border-b-0">
                      <Td>
                        <span className="mono-sm text-text-secondary">
                          {new Date(row.counted_at).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </Td>
                      <Td>
                        {product ? (
                          <Link
                            href={`/inventory/${product.id}`}
                            className="block min-w-0"
                          >
                            <p
                              className="text-text hover:text-[var(--accent)] transition-colors truncate"
                              style={{
                                fontFamily: "var(--display)",
                                fontSize: 13,
                                fontWeight: 500,
                              }}
                            >
                              {product.name}
                            </p>
                            <code
                              className="mono-sm text-text-muted"
                              style={{ fontSize: 11 }}
                            >
                              {product.barcode}
                            </code>
                          </Link>
                        ) : (
                          <span className="mono-sm text-text-dim">—</span>
                        )}
                      </Td>
                      <Td>
                        {loc && sec ? (
                          <>
                            <p className="mono-sm text-text-secondary">
                              {sec.code?.trim() ?? "?"} · Bay {loc.bay} · L
                              {loc.level}
                            </p>
                            {wh && (
                              <p
                                className="mono-sm text-text-dim"
                                style={{ fontSize: 10 }}
                              >
                                {wh.name}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="mono-sm text-text-dim">—</span>
                        )}
                      </Td>
                      <Td align="right">
                        <span className="mono-body text-text-secondary tnum">
                          {row.expected_qty.toLocaleString()}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="mono-body text-text tnum">
                          {row.counted_qty.toLocaleString()}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className={`mono-body tnum ${varianceTone}`}>
                          {row.variance === 0
                            ? "0"
                            : row.variance > 0
                            ? `+${row.variance}`
                            : row.variance}
                        </span>
                      </Td>
                      <Td>
                        <Badge
                          tone={
                            row.status === "adjusted"
                              ? "warning"
                              : row.status === "voided"
                              ? "neutral"
                              : "success"
                          }
                        >
                          {row.status}
                        </Badge>
                      </Td>
                      <Td>
                        <span className="mono-sm text-text-secondary truncate">
                          {counter?.full_name || counter?.email || "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        {product && (
                          <Link
                            href={`/inventory/${product.id}`}
                            className="text-text-dim hover:text-[var(--accent)]"
                            aria-label={`Open ${product.name}`}
                          >
                            <ChevronRight size={12} strokeWidth={1.5} />
                          </Link>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 100 && (
              <div className="px-20 py-10 hairline-t bg-[var(--bg-elevated)]">
                <p className="label-text text-text-dim">
                  Showing the 100 most recent — filter by product to see older
                  counts.
                </p>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function Th({
  children,
  align = "left",
  srOnly,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  srOnly?: boolean;
}) {
  return (
    <th
      scope="col"
      className={`px-16 py-10 label-text text-text-muted ${
        align === "right" ? "text-right" : "text-left"
      } ${srOnly ? "sr-only" : ""}`}
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