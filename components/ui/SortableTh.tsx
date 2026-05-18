import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

export type SortOrder = "asc" | "desc";

interface Props {
  /** Sort key this column represents (matches what the page reads from URL). */
  col: string;
  /** Visible column label. */
  label: string;
  /** Default order when clicking an inactive column. */
  defaultOrder: SortOrder;
  /** Alignment within the cell. */
  align?: "left" | "right";
  /** Currently-active sort column from the page. */
  sort: string;
  /** Currently-active order from the page. */
  order: SortOrder;
  /**
   * Base URL path the link points to (e.g. "/inventory", "/cycle-counts").
   * Sort/order will be appended; other params from `baseParams` preserved.
   */
  basePath: string;
  /** Query params to preserve in the sort URL (filters, search, etc.). */
  baseParams?: Record<string, string>;
}

/**
 * Clickable column header that toggles sort order via URL params.
 *
 * Usage on a page:
 *   const { sort = "updated", order = "desc" } = await searchParams;
 *   // …apply to query…
 *
 *   <SortableTh
 *     col="created_at"
 *     label="Date"
 *     defaultOrder="desc"
 *     sort={sort}
 *     order={order}
 *     basePath="/cycle-counts"
 *     baseParams={{ q: rawQ ?? "" }}
 *   />
 *
 * Clicking an inactive column → use `defaultOrder`.
 * Clicking the active column → flip asc ↔ desc.
 */
export function SortableTh({
  col,
  label,
  defaultOrder,
  align = "left",
  sort,
  order,
  basePath,
  baseParams,
}: Props) {
  const active = sort === col;
  const nextOrder: SortOrder = active
    ? order === "asc"
      ? "desc"
      : "asc"
    : defaultOrder;

  const q = new URLSearchParams(baseParams ?? {});
  q.set("sort", col);
  q.set("order", nextOrder);
  const href = `${basePath}?${q.toString()}`;

  return (
    <th
      scope="col"
      className={`px-20 py-14 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      <Link
        href={href}
        className={`inline-flex items-center gap-6 label-text transition-colors ${
          active ? "text-[var(--accent)]" : "text-text-muted hover:text-text"
        } ${align === "right" ? "flex-row-reverse" : ""}`}
        aria-sort={
          active ? (order === "asc" ? "ascending" : "descending") : "none"
        }
      >
        <span>{label}</span>
        {active ? (
          order === "asc" ? (
            <ArrowUp size={9} strokeWidth={2} aria-hidden />
          ) : (
            <ArrowDown size={9} strokeWidth={2} aria-hidden />
          )
        ) : (
          <ChevronsUpDown
            size={9}
            strokeWidth={1.5}
            aria-hidden
            className="opacity-50"
          />
        )}
      </Link>
    </th>
  );
}

/** Plain header — matches SortableTh visual but not clickable. */
export function Th({
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
