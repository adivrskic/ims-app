import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react";

interface Section {
  code: string | null;
  name: string | null;
}

interface Location {
  quantity: number | null;
  bay: number | null;
  level: number | null;
  section: Section | Section[] | null;
}

interface Product {
  id: string;
  name: string;
  barcode: string;
  internal_sku: string | null;
  manufacturer: string | null;
  reorder_point: number | null;
  updated_at: string | null;
  category:
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  locations: Location[] | null;
}

export type SortKey = "name" | "updated" | "reorder" | "manufacturer";
export type SortOrder = "asc" | "desc";

interface Props {
  products: Product[];
  sort: SortKey;
  order: SortOrder;
  /** q, category, pageSize — preserved on the sort links (page resets to 1) */
  baseParams: Record<string, string>;
}

function firstSection(loc: Location): Section | null {
  if (!loc.section) return null;
  return Array.isArray(loc.section) ? loc.section[0] ?? null : loc.section;
}

function firstCategoryName(p: Product): string | null {
  if (!p.category) return null;
  if (Array.isArray(p.category)) return p.category[0]?.name ?? null;
  return p.category.name;
}

function totalQuantity(locs: Location[] | null): number {
  return (locs ?? []).reduce((sum, l) => sum + (l.quantity ?? 0), 0);
}

function primaryLocationLabel(locs: Location[] | null): string {
  const first = locs?.[0];
  if (!first) return "—";
  const sec = firstSection(first);
  if (!sec || !sec.code) return "Unassigned";
  return `${sec.code.trim()} · Bay ${first.bay} · L${first.level}`;
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
  q.set("page", "1"); // re-sorting changes which rows land on page 1
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
              <Th align="right">On hand</Th>
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
              const stock = totalQuantity(p.locations);
              const reorder = p.reorder_point ?? 0;
              const lowStock = reorder > 0 && stock <= reorder;
              const cat = firstCategoryName(p);

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
                    {cat ? (
                      <Badge tone="neutral">{cat}</Badge>
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
                        {stock.toLocaleString()}
                      </span>
                    </div>
                  </Td>
                  <Td>
                    <span className="mono-sm text-text-secondary">
                      {primaryLocationLabel(p.locations)}
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
      className={`px-20 py-14 ${align === "right" ? "text-right" : "text-left"}`}
      aria-sort={active ? (order === "asc" ? "ascending" : "descending") : "none"}
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
          <ChevronsUpDown
            size={11}
            strokeWidth={1.5}
            className="opacity-40"
          />
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