"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Truck, Package, Clock } from "lucide-react";
import type { Supplier } from "./types";

/**
 * Per-supplier scorecard stats hydrated by the server (purchase_orders
 * and products aggregates). Optional — the list renders fine without
 * them, just without the right-aligned chips.
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
}

export function SupplierList({ suppliers: initial, stats }: Props) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initial.filter((s) => {
      if (!showInactive && !s.is_active) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        (s.contact_name ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q) ||
        (s.phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [initial, query, showInactive]);

  return (
    <div className="flex flex-col gap-16">
      <div className="flex items-center gap-10 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-[400px]">
          <span
            className="absolute left-10 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
            aria-hidden
          >
            <Search size={12} strokeWidth={1.5} />
          </span>
          <input
            type="text"
            placeholder="Search by name, contact, email, phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="field-input w-full"
            style={{ paddingLeft: 32 }}
          />
        </div>
        <button
          type="button"
          onClick={() => setShowInactive((v) => !v)}
          className={`hairline-subtle px-10 py-7 inline-flex items-center gap-6 transition-colors ${
            showInactive
              ? "border-[var(--accent-soft)] bg-[var(--accent-dim)] text-[var(--accent)]"
              : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
          }`}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            {showInactive ? "Showing inactive" : "Active only"}
          </span>
        </button>
        <span className="mono-sm text-text-dim ml-auto">
          {filtered.length} of {initial.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div
          className="hairline bg-[var(--surface)] p-32 text-center mono-sm text-text-dim"
          style={{ lineHeight: 1.6 }}
        >
          {initial.length === 0 ? (
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
          ) : (
            "No suppliers match your search."
          )}
        </div>
      ) : (
        <ul className="hairline bg-[var(--surface)] flex flex-col">
          {filtered.map((s) => {
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
      )}
    </div>
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
