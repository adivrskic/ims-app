import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}

export function EmptyState({ title, description, action, icon }: Props) {
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
      <h3
        className="text-text mb-6"
        style={{
          fontFamily: "var(--display)",
          fontSize: 16,
          fontWeight: 600,
          letterSpacing: "-0.2px",
        }}
      >
        {title}
      </h3>
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
