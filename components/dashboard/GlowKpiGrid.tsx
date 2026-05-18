"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Sparkline } from "@/components/ui/Sparkline";
import { useGlowCards } from "@/lib/useGlowCards";

export interface GlowKpi {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: {
    value: string;
    direction?: "up" | "down" | "flat";
    tone?: "good" | "bad" | "neutral";
  };
  spark?: number[];
}

interface Props {
  kpis: GlowKpi[];
  /** Tailwind grid classes for the container. Default: 2-up on mobile, 4-up on xl. */
  className?: string;
}

/**
 * KPI grid with glow-card hover treatment.
 *
 * Why this component rather than a `glow` prop on KpiCard:
 *   - useGlowCards is a CLIENT hook (mouse tracking + GSAP tilt). KpiCard
 *     is otherwise happy to be a server component. Keeping KpiCard
 *     untouched preserves its server-component status everywhere else.
 *   - The hook needs a parent ref with `glow-cards` class to wire events
 *     once per grid, not once per card.
 *
 * Identical content layout to KpiCard: label + optional sparkline at top,
 * big display value + optional unit, optional delta row at the bottom.
 */
export function GlowKpiGrid({ kpis, className }: Props) {
  const ref = useGlowCards<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className={`glow-cards grid ${
        className ?? "grid-cols-2 xl:grid-cols-4 gap-12"
      }`}
    >
      {kpis.map((kpi, i) => {
        const tone =
          kpi.delta?.tone === "good"
            ? "text-[var(--success)]"
            : kpi.delta?.tone === "bad"
            ? "text-[var(--danger)]"
            : "text-text-muted";

        const DeltaIcon =
          kpi.delta?.direction === "up"
            ? ArrowUp
            : kpi.delta?.direction === "down"
            ? ArrowDown
            : Minus;

        return (
          <article key={i} className="glow-card">
            <div className="glow-card-border" />
            <div className="glow-card-content hairline p-16 flex flex-col gap-10">
              <div className="flex items-start justify-between gap-12">
                <p className="label-text">{kpi.label}</p>
                {kpi.spark && kpi.spark.length > 0 && (
                  <Sparkline
                    values={kpi.spark}
                    width={68}
                    height={22}
                    showDot={false}
                  />
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
                  {kpi.value}
                </span>
                {kpi.unit && (
                  <span className="mono-sm text-text-muted">{kpi.unit}</span>
                )}
              </div>
              {kpi.delta && (
                <div className={`flex items-center gap-5 mono-sm ${tone}`}>
                  <DeltaIcon size={10} strokeWidth={2} />
                  <span>{kpi.delta.value}</span>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
