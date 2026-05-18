"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, User, Building2 } from "lucide-react";
import { paymentTermsLabel, type Customer } from "./types";

interface Props {
  customers: Customer[];
}

export function CustomerList({ customers: initial }: Props) {
  const [query, setQuery] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initial.filter((c) => {
      if (!showInactive && !c.is_active) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.company_name ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q) ||
        (c.phone ?? "").toLowerCase().includes(q)
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
            placeholder="Search by name, company, email, phone…"
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
          {initial.length === 0
            ? "No customers yet. Add your first one to get started."
            : "No customers match your search."}
        </div>
      ) : (
        <ul className="hairline bg-[var(--surface)] flex flex-col">
          {filtered.map((c, i) => (
            <li key={c.id} className={i === 0 ? "" : "hairline-t"}>
              <Link
                href={`/customers/${c.id}`}
                className="flex items-center gap-12 p-14 hover:bg-[var(--surface-2)] transition-colors"
              >
                <span
                  className="w-32 h-32 hairline-subtle bg-[var(--accent-dim)] flex items-center justify-center shrink-0 text-[var(--accent)]"
                  aria-hidden
                >
                  {c.customer_type === "business" ? (
                    <Building2 size={14} strokeWidth={1.5} />
                  ) : (
                    <User size={14} strokeWidth={1.5} />
                  )}
                </span>
                <div className="flex flex-col gap-2 min-w-0 flex-1">
                  <div className="flex items-baseline gap-8 min-w-0">
                    <span
                      className="text-text truncate"
                      style={{
                        fontFamily: "var(--display)",
                        fontSize: 13,
                        fontWeight: 600,
                      }}
                    >
                      {c.name}
                    </span>
                    {c.company_name && (
                      <span
                        className="text-text-muted truncate hidden sm:inline"
                        style={{ fontFamily: "var(--mono)", fontSize: 11 }}
                      >
                        · {c.company_name}
                      </span>
                    )}
                    {!c.is_active && (
                      <span
                        className="hairline-subtle px-6 py-1 shrink-0 text-text-dim"
                        style={{
                          fontFamily: "var(--mono)",
                          fontSize: 9,
                          letterSpacing: "0.5px",
                          textTransform: "uppercase",
                        }}
                      >
                        Inactive
                      </span>
                    )}
                  </div>
                  <span
                    className="text-text-dim truncate"
                    style={{ fontFamily: "var(--mono)", fontSize: 11 }}
                  >
                    {c.email || c.phone || "—"}
                  </span>
                </div>
                <div className="hidden md:flex flex-col items-end gap-2 shrink-0">
                  <span
                    className="text-text-muted"
                    style={{
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                    }}
                  >
                    {shortTerms(c.payment_terms)}
                  </span>
                  {c.discount_percent > 0 && (
                    <span
                      className="text-text-dim tnum"
                      style={{ fontFamily: "var(--mono)", fontSize: 10 }}
                    >
                      {c.discount_percent}% disc.
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
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
