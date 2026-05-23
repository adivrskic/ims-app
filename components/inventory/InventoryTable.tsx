import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
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
        <table className="w-full border-collapse text-left">
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
              <Th>Barcode</Th>
              <Th>Category</Th>
              <SortableTh
                col="onhand"
                label="On hand"
                defaultOrder="desc"
                align="right"
                sort={sort}
                order={order}
                baseParams={baseParams}
              />
              <Th>Primary location</Th>
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
              <Th align="right" srOnly>
                Open
              </Th>
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
                    i % 2 === 1 ? "bg-[rgba(255,255,255,0.01)]" : ""
                  }`}
                >
                  <Td>
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
                  </Td>
                  <Td>
                    <span className="mono-sm text-text-secondary">
                      {p.barcode}
                    </span>
                    {p.internal_sku && (
                      <div className="mono-sm text-text-dim">
                        SKU {p.internal_sku}
                      </div>
                    )}
                  </Td>
                  <Td>
                    {p.category_name ? (
                      <Badge tone="neutral">{p.category_name}</Badge>
                    ) : (
                      <span className="mono-sm text-text-dim">—</span>
                    )}
                  </Td>
                  <Td align="right">
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
                  </Td>
                  <Td>
                    <span className="mono-sm text-text-secondary">
                      {p.primary_location}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="mono-sm text-text-muted tnum">
                      {reorder === 0 ? "—" : reorder.toLocaleString()}
                    </span>
                  </Td>
                  <Td align="right">
                    <time
                      className="mono-sm text-text-dim"
                      dateTime={p.updated_at ?? undefined}
                    >
                      {p.updated_at
                        ? new Date(p.updated_at).toLocaleDateString()
                        : "—"}
                    </time>
                  </Td>
                  <Td align="right">
                    <ChevronRight
                      size={14}
                      strokeWidth={1.5}
                      className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all"
                    />
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
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
      className={`px-20 py-14 label-text ${
        align === "right" ? "text-right" : "text-left"
      } ${srOnly ? "sr-only" : ""}`}
    >
      {children}
    </th>
  );
}

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
    <th
      scope="col"
      className={`px-20 py-14 ${
        align === "right" ? "text-right" : "text-left"
      }`}
      aria-sort={
        active ? (order === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <Link
        href={href}
        className={`inline-flex items-center gap-6 label-text transition-colors ${
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
      className={`px-20 py-12 align-middle ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}
