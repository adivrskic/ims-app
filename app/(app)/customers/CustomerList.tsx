import Link from "next/link";
import { User, Building2 } from "lucide-react";
import { type Customer } from "./types";

/**
 * Server-rendered customer directory list. Filtering (search / active-only)
 * and pagination happen in the database — the page passes exactly the rows
 * to render (see lib/data/customers.ts + ListSearchToolbar/ListPagination).
 */
interface Props {
  customers: Customer[];
  /** True when a search / inactive filter is active (tunes the empty copy). */
  hasFilters?: boolean;
}

export function CustomerList({ customers, hasFilters = false }: Props) {
  if (customers.length === 0) {
    return (
      <div
        className="hairline bg-[var(--surface)] p-32 text-center mono-sm text-text-dim"
        style={{ lineHeight: 1.6 }}
      >
        {hasFilters
          ? "No customers match your search."
          : "No customers yet. Add your first one to get started."}
      </div>
    );
  }

  return (
    <ul className="hairline bg-[var(--surface)] flex flex-col">
      {customers.map((c, i) => (
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
