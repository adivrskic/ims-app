import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { EmptyState } from "@/components/ui/EmptyState";
import { CornerLink } from "@/components/ui/CornerButton";
import type { PrioritizedCount } from "@/lib/data/cycleCounts";

/**
 * "Count next" — products ranked by discrepancy risk (§2c).
 *
 * Read-only ranking; it doesn't change the counting flow, it just tells the
 * operator where to point it. Risk is computed in lib/cycle-risk and ordered
 * highest-first by getCycleCountsPageData. Each row deep-links into the count
 * form pre-filtered to that product.
 */
export function CycleCountPriorityList({
  items,
}: {
  items: PrioritizedCount[];
}) {
  return (
    <section aria-labelledby="count-next-heading">
      <SectionTitle
        eyebrow="Prioritize"
        title="Count next"
        action={
          items.length > 0 ? (
            <span className="label-text text-text-muted">
              ranked by discrepancy risk
            </span>
          ) : undefined
        }
      />
      {items.length === 0 ? (
        <EmptyState
          title="Nothing flagged"
          description="Once products build up a count history, the ones most likely to be holding an undetected discrepancy — frequent variances, large swings, fast movers, or long since last counted — surface here."
          icon={<ClipboardCheck size={20} strokeWidth={1.5} />}
        />
      ) : (
        <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
          {items.map((item, idx) => (
            <li
              key={item.product_id}
              className="px-20 py-14 flex items-center gap-16 row-interactive"
            >
              <span
                className="mono-sm text-text-dim tnum w-16 shrink-0"
                aria-hidden
              >
                {String(idx + 1).padStart(2, "0")}
              </span>

              <div className="flex-1 min-w-0">
                <Link
                  href={`/inventory/${item.product_id}`}
                  className="mono-body text-text hover:text-[var(--accent)] transition-colors truncate block"
                >
                  {item.product_name}
                </Link>
                <p className="mono-sm text-text-muted truncate">
                  {item.barcode ? `${item.barcode} · ` : ""}
                  {item.reason}
                </p>
              </div>

              <div className="text-right shrink-0">
                <p className="mono-sm text-text-secondary tnum">
                  {item.on_hand != null
                    ? `${item.on_hand.toLocaleString()} on hand`
                    : "—"}
                </p>
                <p className="mono-sm text-text-dim tnum">
                  {item.days_since_last_count != null
                    ? `${item.days_since_last_count}d ago`
                    : "never counted"}
                </p>
              </div>

              <CornerLink
                href={`/cycle-counts?product=${item.product_id}`}
                variant="ghost"
                size="sm"
              >
                Count →
              </CornerLink>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
