import type { ReactNode } from "react";

interface Props {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}

export function SectionTitle({ eyebrow, title, action }: Props) {
  return (
    <div className="flex items-baseline justify-between gap-16 mb-12 pb-10 hairline-b">
      <div className="flex items-baseline gap-10 min-w-0">
        <h2
          className="text-text"
          style={{
            fontFamily: "var(--display)",
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: "-0.2px",
          }}
        >
          {title}
        </h2>
        {eyebrow && <span className="label-text">· {eyebrow}</span>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
