"use client";

import { useEffect, useState } from "react";
import { Sparkline } from "@/components/ui/Sparkline";

interface Props {
  workspaceName: string;
  leadMetric: { label: string; value: number; trend: number[]; suffix?: string };
  metaItems: Array<{ label: string; value: string; status?: "live" | "online" | "offline" }>;
}

export function OverviewHero({ workspaceName, leadMetric, metaItems }: Props) {
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        })
      );
    };
    update();
    const i = setInterval(update, 1000);
    return () => clearInterval(i);
  }, []);

  return (
    <section className="relative hairline bg-[var(--surface)] overflow-hidden glow-tr">
      <div className="absolute inset-0 scanlines pointer-events-none" aria-hidden />
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[var(--accent)] to-transparent" aria-hidden />

      <div className="relative z-[1] p-32 lg:p-40">
        <div className="flex items-start justify-between flex-wrap gap-32 mb-40">
          <div>
            <p className="label-text--lg text-[var(--accent)] mb-12 flex items-center gap-12">
              <span className="inline-block w-24 h-px bg-[var(--accent)]" aria-hidden />
              {workspaceName} · Live ops
            </p>
            <h1 className="heading-md">
              The floor, <span className="accent-italic">right now</span>
            </h1>
          </div>
          <div className="flex items-center gap-16">
            <div className="flex flex-col items-end">
              <span className="label-text text-text-muted">Local time</span>
              <span className="mono-body text-text tnum">{time || "—"}</span>
            </div>
            <span className="inline-flex items-center gap-8 hairline-subtle px-12 py-8 bg-[var(--accent-dim)]">
              <span className="dot dot-live" aria-hidden />
              <span className="label-text text-[var(--accent)]">Live</span>
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-32 lg:gap-48 items-end">
          <div>
            <p className="label-text--lg text-text-muted mb-16">{leadMetric.label}</p>
            <div className="flex items-baseline gap-16 flex-wrap">
              <span className="display-lg tnum accent-gradient" style={{ fontFamily: "var(--display)", fontWeight: 700, lineHeight: 1.02, letterSpacing: "-3px" }}>
                {leadMetric.value.toLocaleString()}
              </span>
              {leadMetric.suffix && (
                <span className="label-text--lg text-text-muted">
                  {leadMetric.suffix}
                </span>
              )}
            </div>
          </div>

          <div className="hairline-subtle bg-[var(--surface-2)] p-20">
            <p className="label-text mb-12">Last 14 days</p>
            <Sparkline values={leadMetric.trend} width={280} height={56} className="w-full" />
          </div>
        </div>

        <dl className="grid grid-cols-2 md:grid-cols-4 gap-x-32 gap-y-16 mt-40 pt-24 hairline-t">
          {metaItems.map((m, i) => (
            <div key={i} className="flex flex-col gap-6">
              <dt className="flex items-center gap-8 text-text-muted">
                {m.status && <span className={`dot dot-${m.status}`} aria-hidden />}
                <span className="label-text">{m.label}</span>
              </dt>
              <dd className="mono-body text-text tnum">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
