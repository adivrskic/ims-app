import type { ComponentProps } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Th, Td } from "@/components/ui/Table";

// The inventory list is the densest table in the app and keeps its wider cells.
type CellProps = ComponentProps<typeof Th>;
function InvTh({ className = "", ...p }: CellProps) {
  return <Th {...p} className={`px-20 py-14 ${className}`.trim()} />;
}
function InvTd({ className = "", ...p }: ComponentProps<typeof Td>) {
  return <Td {...p} className={`px-20 py-14 ${className}`.trim()} />;
}
import { LocalTime } from "@/components/ui/LocalTime";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";
import type { InventoryRow, SortKey, SortOrder } from "@/lib/data/inventory";

export type { SortKey, SortOrder } from "@/lib/data/inventory";

interface Props {
  products: InventoryRow[];
  sort: SortKey;
  order: SortOrder;
  /** q, category, low, pageSize — preserved on sort links (page resets to 1) */
  baseParams: Record<string, string>;
}

function buildSortUrl(
  col: SortKey,
  defaultOrder: SortOrder,
  currentSort: SortKey,
  currentOrder: SortOrder,
  baseParams: Record<string, string>
): string {
  const q = new URLSearchParams(baseParams);
  const newOrder: SortOrder =
    col === currentSort
      ? currentOrder === "asc"
        ? "desc"
        : "asc"
      : defaultOrder;
  q.set("sort", col);
  q.set("order", newOrder);
  q.set("page", "1");
  return `/inventory?${q.toString()}`;
}

export function InventoryTable({ products, sort, order, baseParams }: Props) {
  return (
    <div className="hairline overflow-hidden bg-[var(--surface)]">
      <div className="overflow-x-auto">
        <table
          className="w-full border-collapse text-left"
          aria-label="Inventory"
        >
          <thead className="bg-[var(--bg-elevated)]">
            <tr className="hairline-b">
              <SortableTh
                col="name"
                label="SKU · Product"
                defaultOrder="asc"
                sort={sort}
                order={order}
                baseParams={baseParams}
              />
              <InvTh>Barcode</InvTh>
              <InvTh>Category</InvTh>
              <SortableTh
                col="onhand"
                label="On hand"
                defaultOrder="desc"
                align="right"
                sort={sort}
                order={order}
                baseParams={baseParams}
              />
              <InvTh>Primary location</InvTh>
              <SortableTh
                col="reorder"
                label="Reorder pt"
                defaultOrder="desc"
                align="right"
                sort={sort}
                order={order}
                baseParams={baseParams}
              />
              <SortableTh
                col="updated"
                label="Updated"
                defaultOrder="desc"
                align="right"
                sort={sort}
                order={order}
                baseParams={baseParams}
              />
              <InvTh align="right" className="sr-only">
                Open
              </InvTh>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => {
              const reorder = p.reorder_point ?? 0;
              const lowStock = reorder > 0 && p.on_hand <= reorder;

              return (
                <tr
                  key={p.id}
                  className={`hairline-b row-interactive group ${
                    i % 2 === 1 ? "bg-[var(--surface-2)]" : ""
                  }`}
                >
                  <InvTd>
                    <Link href={`/inventory/${p.id}`} className="block min-w-0">
                      <div
                        className="text-text group-hover:text-[var(--accent)] transition-colors truncate"
                        style={{
                          fontFamily: "var(--display)",
                          fontSize: "15px",
                          fontWeight: 500,
                        }}
                      >
                        {p.name}
                      </div>
                      {p.manufacturer && (
                        <div className="mono-sm text-text-muted truncate">
                          {p.manufacturer}
                        </div>
                      )}
                    </Link>
                  </InvTd>
                  <InvTd>
                    <span className="mono-sm text-text-secondary">
                      {p.barcode}
                    </span>
                    {p.internal_sku && (
                      <div className="mono-sm text-text-dim">
                        SKU {p.internal_sku}
                      </div>
                    )}
                  </InvTd>
                  <InvTd>
                    {p.category_name ? (
                      <Badge tone="neutral">{p.category_name}</Badge>
                    ) : (
                      <span className="mono-sm text-text-dim">—</span>
                    )}
                  </InvTd>
                  <InvTd align="right">
                    <div className="flex items-center justify-end gap-8">
                      {lowStock && (
                        <span className="dot dot-alert" aria-hidden />
                      )}
                      <span
                        className={`mono-body tnum ${
                          lowStock ? "text-[var(--danger)]" : "text-text"
                        }`}
                      >
                        {p.on_hand.toLocaleString()}
                      </span>
                    </div>
                  </InvTd>
                  <InvTd>
                    <span className="mono-sm text-text-secondary">
                      {p.primary_location}
                    </span>
                  </InvTd>
                  <InvTd align="right">
                    <span className="mono-sm text-text-muted tnum">
                      {reorder === 0 ? "—" : reorder.toLocaleString()}
                    </span>
                  </InvTd>
                  <InvTd align="right">
                    {/* Viewer-local date; the server used to print UTC. */}
                    <LocalTime
                      iso={p.updated_at}
                      format="date"
                      className="mono-sm text-text-dim"
                    />
                  </InvTd>
                  <InvTd align="right">
                    <ChevronRight
                      size={14}
                      strokeWidth={1.5}
                      className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all"
                    />
                  </InvTd>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Sortable column header: the shared `Th` (scope="col") carrying `aria-sort`
 * for the active column, with the sort link inside.
 */
function SortableTh({
  col,
  label,
  defaultOrder,
  align = "left",
  sort,
  order,
  baseParams,
}: {
  col: SortKey;
  label: string;
  defaultOrder: SortOrder;
  align?: "left" | "right";
  sort: SortKey;
  order: SortOrder;
  baseParams: Record<string, string>;
}) {
  const active = sort === col;
  const href = buildSortUrl(col, defaultOrder, sort, order, baseParams);

  return (
    <InvTh
      align={align}
      aria-sort={
        active ? (order === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Link
        href={href}
        className={`inline-flex items-center gap-6 transition-colors ${
          active ? "text-[var(--accent)]" : "text-text-muted hover:text-text"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
      >
        <span>{label}</span>
        {active ? (
          order === "asc" ? (
            <ArrowUp size={11} strokeWidth={1.5} />
          ) : (
            <ArrowDown size={11} strokeWidth={1.5} />
          )
        ) : (
          <ChevronsUpDown size={11} strokeWidth={1.5} className="opacity-40" />
        )}
      </Link>
    </InvTh>
  );
}
