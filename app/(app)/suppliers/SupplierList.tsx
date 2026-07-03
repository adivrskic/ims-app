import Link from "next/link";
import { Truck, Package, Clock } from "lucide-react";
import type { Supplier } from "./types";

/**
 * Server-rendered supplier directory list. Filtering (search / active-only)
 * and pagination happen in the database — the page passes exactly the rows
 * to render (see lib/data/suppliers.ts + ListSearchToolbar/ListPagination).
 *
 * Per-supplier scorecard stats are hydrated by the server (purchase_orders
 * and products aggregates). Optional — the list renders fine without them,
 * just without the right-aligned chips.
 */
export interface SupplierStats {
  poCount: number;
  productCount: number;
  onTimePct: number | null;
  avgLeadDays: number | null;
}
export type SupplierStatsMap = Record<string, SupplierStats>;

interface Props {
  suppliers: Supplier[];
  stats?: SupplierStatsMap;
  /** True when a search / inactive filter is active (tunes the empty copy). */
  hasFilters?: boolean;
}

export function SupplierList({ suppliers, stats, hasFilters = false }: Props) {
  if (suppliers.length === 0) {
    return (
      <div
        className="hairline bg-[var(--surface)] p-32 text-center mono-sm text-text-dim"
        style={{ lineHeight: 1.6 }}
      >
        {hasFilters ? (
          "No suppliers match your search."
        ) : (
          <>
            <Truck
              size={20}
              strokeWidth={1.5}
              className="mx-auto mb-10 opacity-50"
            />
            No suppliers yet.{" "}
            <Link
              href="/suppliers/new"
              className="text-[var(--accent)] hover:underline"
            >
              Add your first
            </Link>{" "}
            to start tracking POs.
          </>
        )}
      </div>
    );
  }

  return (
    <ul className="hairline bg-[var(--surface)] flex flex-col">
      {suppliers.map((s) => {
        const stat = stats?.[s.id];
        return (
          <li
            key={s.id}
            className="hairline-b last:border-b-0 hover:bg-[var(--surface-2)] transition-colors"
          >
            <Link
              href={`/suppliers/${s.id}`}
              className="flex items-center gap-14 px-16 py-14"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-10 mb-3 flex-wrap">
                  <p
                    className="text-text truncate"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 14,
                      fontWeight: 500,
                    }}
                  >
                    {s.name}
                  </p>
                  {!s.is_active && (
                    <span
                      className="hairline-subtle px-6 py-1 text-text-dim"
                      style={{
                        fontFamily: "var(--mono)",
                        fontSize: 9,
                        letterSpacing: "0.5px",
                        textTransform: "uppercase",
                      }}
                    >
                      Archived
                    </span>
                  )}
                </div>
                <p
                  className="mono-sm text-text-muted truncate"
                  style={{ fontSize: 11 }}
                >
                  {s.contact_name ? `${s.contact_name} · ` : ""}
                  {s.email ?? s.phone ?? "No contact info"}
                </p>
              </div>

              {/* Scorecard chips — only render when we have stats. */}
              {stat && (
                <div className="hidden md:flex items-center gap-10 shrink-0">
                  <Chip
                    icon={<Truck size={10} strokeWidth={1.5} />}
                    label={`${stat.poCount} ${
                      stat.poCount === 1 ? "PO" : "POs"
                    }`}
                  />
                  <Chip
                    icon={<Package size={10} strokeWidth={1.5} />}
                    label={`${stat.productCount} ${
                      stat.productCount === 1 ? "product" : "products"
                    }`}
                  />
                  {stat.onTimePct != null && (
                    <Chip
                      tone={
                        stat.onTimePct >= 90
                          ? "good"
                          : stat.onTimePct >= 70
                          ? "warn"
                          : "bad"
                      }
                      label={`${stat.onTimePct}% on-time`}
                    />
                  )}
                  {stat.avgLeadDays != null && (
                    <Chip
                      icon={<Clock size={10} strokeWidth={1.5} />}
                      label={`${stat.avgLeadDays}d avg`}
                    />
                  )}
                </div>
              )}

              <span
                className="text-text-muted mono-sm shrink-0"
                style={{ fontSize: 11 }}
              >
                {shortTerms(s.payment_terms)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Chip({
  icon,
  label,
  tone,
}: {
  icon?: React.ReactNode;
  label: string;
  tone?: "good" | "warn" | "bad";
}) {
  const toneColor =
    tone === "good"
      ? "var(--success)"
      : tone === "warn"
      ? "var(--warning)"
      : tone === "bad"
      ? "var(--danger)"
      : "var(--text-muted)";
  return (
    <span
      className="inline-flex items-center gap-4 tnum"
      style={{
        fontFamily: "var(--mono)",
        fontSize: 10,
        letterSpacing: "0.4px",
        color: toneColor,
      }}
    >
      {icon}
      {label}
    </span>
  );
}

function shortTerms(t: string): string {
  switch (t) {
    case "cod":
      return "COD";
    case "due_on_receipt":
      return "DOR";
    case "net_15":
      return "Net 15";
    case "net_30":
      return "Net 30";
    case "net_60":
      return "Net 60";
    case "net_90":
      return "Net 90";
    default:
      return t;
  }
}
