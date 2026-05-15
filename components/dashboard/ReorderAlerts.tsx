import Link from "next/link";
import { AlertTriangle, ChevronRight, Sparkles } from "lucide-react";
import { draftReorderPO } from "@/app/(app)/purchase-orders/actions";

interface LowStockProduct {
  id: string;
  name: string;
  barcode: string;
  reorder_point: number;
  total: number;
  category_name: string | null;
}

interface Props {
  products: LowStockProduct[];
}

export function ReorderAlerts({ products }: Props) {
  if (products.length === 0) {
    return (
      <div className="hairline bg-[var(--surface)] px-20 py-14 flex items-center gap-12">
        <span className="dot dot-online" aria-hidden />
        <p className="mono-sm text-text-secondary">
          All SKUs are at or above their reorder points.
        </p>
      </div>
    );
  }

  return (
    <div className="hairline bg-[var(--surface)] flex flex-col">
      <header className="px-20 py-12 hairline-b flex items-center justify-between gap-12">
        <div className="flex items-center gap-10">
          <AlertTriangle
            size={12}
            strokeWidth={1.5}
            className="text-[var(--warning)]"
            aria-hidden
          />
          <span className="label-text text-[var(--warning)]">
            Needs attention · {products.length}
          </span>
        </div>
        <form action={draftReorderPO}>
          <button
            type="submit"
            className="inline-flex items-center gap-6 text-text-muted hover:text-[var(--accent)] transition-colors"
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "1.5px",
              textTransform: "uppercase",
            }}
          >
            <Sparkles size={10} strokeWidth={1.5} />
            Draft reorder PO
            <ChevronRight size={10} strokeWidth={1.5} />
          </button>
        </form>
      </header>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {products.map((p) => {
          const shortfall = p.reorder_point - p.total;
          return (
            <li key={p.id}>
              <Link
                href={`/inventory/${p.id}`}
                className="px-20 py-12 flex items-center gap-14 row-interactive group"
              >
                <div className="flex-1 min-w-0">
                  <p
                    className="text-text truncate group-hover:text-[var(--accent)] transition-colors"
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {p.name}
                  </p>
                  <div className="flex items-center gap-10 mono-sm text-text-muted">
                    <code style={{ fontSize: 11 }}>{p.barcode}</code>
                    {p.category_name && (
                      <>
                        <span>·</span>
                        <span>{p.category_name}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="mono-body text-[var(--danger)] tnum">
                    {p.total}
                  </p>
                  <p className="label-text text-text-dim">
                    of {p.reorder_point}
                  </p>
                </div>
                <div className="hidden md:flex flex-col items-end shrink-0 w-[88px]">
                  <p className="mono-sm text-text-muted">Short by</p>
                  <p className="mono-body text-[var(--warning)] tnum">
                    {shortfall > 0 ? shortfall : 0}
                  </p>
                </div>
                <ChevronRight
                  size={12}
                  strokeWidth={1.5}
                  className="text-text-dim opacity-0 group-hover:opacity-100 group-hover:text-[var(--accent)] transition-all shrink-0"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
