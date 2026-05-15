import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
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
  className?: string;
}

export function KpiCard({
  label,
  value,
  unit,
  delta,
  spark,
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

  return (
    <article
      className={`hairline bg-[var(--surface)] p-16 flex flex-col gap-10 ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between gap-12">
        <p className="label-text">{label}</p>
        {spark && spark.length > 0 && (
          <Sparkline values={spark} width={68} height={22} showDot={false} />
        )}
      </div>
      <div className="flex items-baseline gap-6">
        <span
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
    </article>
  );
}
