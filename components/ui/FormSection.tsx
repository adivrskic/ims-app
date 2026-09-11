import { useId } from "react";
import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: ReactNode;
  /** Right-aligned header slot, e.g. an "Add line" button. */
  action?: ReactNode;
  /**
   * `card` (default) wraps the section in a hairline surface; `plain` is for
   * sections that already sit inside a card (modals, nested groups).
   */
  variant?: "card" | "plain";
  className?: string;
  children: ReactNode;
}

/**
 * One titled group of fields. Every form used to hand-roll this three
 * different ways (inline-styled h2s, label-text legends, local Section
 * helpers); this is the one shape, with the title wired up as the section's
 * accessible name.
 */
export function FormSection({
  title,
  description,
  action,
  variant = "card",
  className,
  children,
}: Props) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={`${
        variant === "card" ? "hairline bg-[var(--surface)] p-20" : ""
      } flex flex-col gap-16 ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-16">
        <div className="min-w-0">
          <h2 id={titleId} className="form-section-title">
            {title}
          </h2>
          {description && <p className="form-section-desc">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {children}
    </section>
  );
}
