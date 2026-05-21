import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ArrowUpRight, Minus } from "lucide-react";
import { Sparkline } from "./Sparkline";

interface Props {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: {
    value: string;
    direction?: "up" | "down" | "flat";
    tone?: "good" | "bad" | "neutral";
  };
  spark?: number[];
  /**
   * P3: when set, the card becomes a Link that navigates to the URL on
   * click. Used for drill-downs from Overview KPIs to filtered list views.
   */
  href?: string;
  /**
   * Optional accessible label for the drill-down link. Defaults to
   * "View {label} details".
   */
  hrefLabel?: string;
  className?: string;
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  spark,
  href,
  hrefLabel,
  className,
}: Props) {
  const tone =
    delta?.tone === "good"
      ? "text-[var(--success)]"
      : delta?.tone === "bad"
      ? "text-[var(--danger)]"
      : "text-text-muted";

  const Icon =
    delta?.direction === "up"
      ? ArrowUp
      : delta?.direction === "down"
      ? ArrowDown
      : Minus;

  const interactive = href ? "row-interactive group cursor-pointer" : "";

  const inner = (
    <>
      <div className="flex items-start justify-between gap-12">
        <p className="label-text">{label}</p>
        <div className="flex items-center gap-6">
          {spark && spark.length > 0 && (
            <Sparkline values={spark} width={68} height={22} showDot={false} />
          )}
          {href && (
            <ArrowUpRight
              size={11}
              strokeWidth={1.5}
              className="text-text-dim group-hover:text-[var(--accent)] transition-colors shrink-0"
              aria-hidden
            />
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-6">
        <span
          data-kpi-value
          className="text-text tnum truncate"
          style={{
            fontFamily: "var(--display)",
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-0.4px",
            lineHeight: 1.05,
          }}
        >
          {value}
        </span>
        {unit && <span className="mono-sm text-text-muted">{unit}</span>}
      </div>
      {delta && (
        <div className={`flex items-center gap-5 mono-sm ${tone}`}>
          <Icon size={10} strokeWidth={2} />
          <span>{delta.value}</span>
        </div>
      )}
    </>
  );

  const sharedClass = `hairline bg-[var(--surface)] p-16 flex flex-col gap-10 ${interactive} ${
    className ?? ""
  }`;

  if (href) {
    return (
      <Link
        href={href}
        className={sharedClass}
        aria-label={hrefLabel ?? `View ${label} details`}
      >
        {inner}
      </Link>
    );
  }

  return <article className={sharedClass}>{inner}</article>;
}
