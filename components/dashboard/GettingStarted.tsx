import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, Check, X } from "lucide-react";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { dismissGettingStarted } from "@/app/(app)/actions";

export interface GettingStartedItem {
  key: string;
  label: string;
  desc: string;
  href: string;
  /** Derived from live counts where possible; undefined = no done-state. */
  done?: boolean;
}

interface Props {
  numeral: string;
  items: GettingStartedItem[];
  /** Optional row beneath the list — the sample-data offer. */
  footer?: ReactNode;
}

/**
 * First-run checklist — the overview's welcome mat for a young workspace.
 * Composed by the page from the org's enabled modules AND the viewer's role
 * permissions (a day-0 member never gets a link that 403s). Server-rendered;
 * dismissal is a one-click server action writing profiles.dashboard_prefs.
 */
export function GettingStarted({ numeral, items, footer }: Props) {
  const doneCount = items.filter((i) => i.done).length;
  return (
    <section aria-labelledby="getting-started">
      <SectionTitle
        numeral={numeral}
        eyebrow="Welcome"
        title="Getting started"
        action={
          <form action={dismissGettingStarted}>
            <button
              type="submit"
              className="inline-flex items-center gap-6 mono-sm text-text-dim hover:text-text transition-colors"
              aria-label="Dismiss the getting-started checklist"
            >
              <X size={10} strokeWidth={1.5} />
              Dismiss
            </button>
          </form>
        }
      />
      <div className="hairline bg-[var(--surface)]">
        <p className="px-20 py-10 hairline-b mono-sm text-text-muted">
          {doneCount} of {items.length} done — knock these out in any order.
          This card retires itself once you&apos;re rolling.
        </p>
        <ul className="divide-y divide-[var(--border-subtle)]">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="px-20 py-12 flex items-center gap-14 hover:bg-[var(--surface-2)] transition-colors group"
              >
                <span
                  className={`w-18 h-18 shrink-0 hairline-subtle flex items-center justify-center ${
                    item.done
                      ? "border-[var(--accent-soft)] bg-[var(--accent-dim)] text-[var(--accent)]"
                      : "text-transparent"
                  }`}
                  aria-hidden
                >
                  <Check size={10} strokeWidth={2} />
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={`block truncate ${
                      item.done ? "text-text-muted line-through" : "text-text"
                    }`}
                    style={{
                      fontFamily: "var(--display)",
                      fontSize: 13,
                      fontWeight: 500,
                    }}
                  >
                    {item.label}
                  </span>
                  <span className="block mono-sm text-text-dim truncate">
                    {item.desc}
                  </span>
                </span>
                <ArrowRight
                  size={11}
                  strokeWidth={1.5}
                  className="shrink-0 text-text-dim group-hover:text-[var(--accent)] transition-colors"
                  aria-hidden
                />
              </Link>
            </li>
          ))}
        </ul>
        {footer && <div className="px-20 py-14 hairline-t">{footer}</div>}
      </div>
    </section>
  );
}
