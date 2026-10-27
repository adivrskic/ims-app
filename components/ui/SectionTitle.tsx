import type { ReactNode } from "react";

interface Props {
  /** Optional ordinal shown as a small mono prefix before the title (e.g. "01"). */
  numeral?: string;
  eyebrow?: string;
  title: string;
  action?: ReactNode;
  /**
   * Id for the <h2>, so a wrapping `<section aria-labelledby={id}>` resolves.
   * Every section that labels itself this way must pass the same string.
   */
  id?: string;
}

export function SectionTitle({ numeral, eyebrow, title, action, id }: Props) {
  return (
    <div className="flex items-baseline justify-between gap-16 mb-12 pb-10 hairline-b">
      <div className="flex items-baseline gap-10 min-w-0">
        {numeral && (
          <span className="label-text tnum shrink-0" aria-hidden>
            {numeral}
          </span>
        )}
        <h2
          id={id}
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
