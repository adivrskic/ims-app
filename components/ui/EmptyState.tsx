import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  /**
   * Heading level for the title. Defaults to 3 (an empty state usually sits
   * under a section's h2); pass 2 when the empty state IS the section, so
   * the page outline does not skip from h1 to h3.
   */
  headingLevel?: 2 | 3;
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  headingLevel = 3,
}: Props) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <div className="hairline-subtle bg-[var(--surface-2)] py-48 px-24 flex flex-col items-center text-center">
      {icon && (
        <div
          className="text-text-muted mb-16 hairline-subtle p-12 bg-[var(--bg)]"
          aria-hidden="true"
        >
          {icon}
        </div>
      )}
      <Heading
        className="text-text mb-6"
        style={{
          fontFamily: "var(--display)",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.2px",
        }}
      >
        {title}
      </Heading>
      {description && (
        <p
          className="text-text-muted max-w-[440px] mb-20"
          style={{ fontFamily: "var(--mono)", fontSize: 12, lineHeight: 1.6 }}
        >
          {description}
        </p>
      )}
      {action}
    </div>
  );
}
