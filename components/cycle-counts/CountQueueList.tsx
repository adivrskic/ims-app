import Link from "next/link";
import { CalendarClock, X } from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";
import { dismissCountTask } from "@/app/(app)/cycle-counts/actions";
import type { CountQueueTask } from "@/lib/data/cycleCounts";

/**
 * The scheduled count queue — pending cycle_count_tasks filed by the weekly
 * cron (/api/cron/cycle-count-queue) from the discrepancy-risk ranking.
 * Recording a count for a queued product completes its task automatically;
 * Dismiss clears a task without counting (e.g. a SKU being retired).
 *
 * Renders nothing when the queue is empty — the always-on "Count next"
 * ranking below covers discovery, and an empty queue section would just be
 * noise for orgs that haven't opted in.
 */
export function CountQueueList({ items }: { items: CountQueueTask[] }) {
  if (items.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section aria-labelledby="count-queue-heading">
      <SectionTitle
        eyebrow="Scheduled"
        title="This week's count queue"
        action={
          <span className="label-text text-text-muted">
            <CalendarClock
              size={11}
              strokeWidth={1.5}
              className="inline mr-4 -mt-1"
              aria-hidden
            />
            {items.length} pending
          </span>
        }
      />
      <ul className="hairline bg-[var(--surface)] divide-y divide-[var(--border-subtle)]">
        {items.map((task) => {
          const overdue = task.due_date < today;
          return (
            <li
              key={task.id}
              className="px-20 py-14 flex items-center gap-16 row-interactive"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/inventory/${task.product_id}`}
                  className="mono-body text-text hover:text-[var(--accent)] transition-colors truncate block"
                >
                  {task.product_name}
                </Link>
                <p className="mono-sm text-text-muted truncate">
                  {task.barcode ? `${task.barcode} · ` : ""}
                  {task.reason ?? "scheduled count"}
                </p>
              </div>

              <p
                className={`mono-sm tnum shrink-0 ${
                  overdue ? "text-[var(--danger)]" : "text-text-dim"
                }`}
              >
                due {task.due_date}
              </p>

              <CornerLink
                href={`/cycle-counts?product=${task.product_id}`}
                variant="ghost"
                size="sm"
              >
                Count →
              </CornerLink>

              <form action={dismissCountTask}>
                <input type="hidden" name="id" value={task.id} />
                <CornerButton
                  type="submit"
                  variant="ghost"
                  size="sm"
                  title="Dismiss without counting"
                  aria-label={`Dismiss count task for ${task.product_name}`}
                >
                  <X size={11} strokeWidth={1.5} />
                </CornerButton>
              </form>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
