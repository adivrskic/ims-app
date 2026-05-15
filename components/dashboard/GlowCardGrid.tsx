"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { useGlowCards } from "@/lib/useGlowCards";

interface Card {
  href: string;
  icon: ReactNode;
  label: string;
  description: string;
  meta?: string;
  soon?: boolean;
}

interface Props {
  cards: Card[];
}

export function GlowCardGrid({ cards }: Props) {
  const ref = useGlowCards<HTMLDivElement>();

  return (
    <div
      ref={ref}
      className="glow-cards grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12"
    >
      {cards.map((card) => {
        if (card.soon) {
          return (
            <div
              key={card.href}
              className="hairline-subtle bg-[var(--surface-2)] p-16 flex flex-col gap-10 opacity-55 min-h-[132px]"
            >
              <div className="flex items-start justify-between gap-12">
                <span className="text-text-muted">{card.icon}</span>
                <span className="label-text text-text-dim">Soon</span>
              </div>
              <div>
                <h3
                  className="text-text mb-4"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                  }}
                >
                  {card.label}
                </h3>
                <p
                  className="text-text-muted leading-relaxed"
                  style={{ fontFamily: "var(--mono)", fontSize: 11 }}
                >
                  {card.description}
                </p>
              </div>
            </div>
          );
        }
        return (
          <article key={card.href} className="glow-card">
            <div className="glow-card-border" />
            <div className="glow-card-content hairline p-16 flex flex-col gap-10 min-h-[132px]">
              <Link
                href={card.href}
                className="absolute inset-0 z-[3]"
                aria-label={card.label}
              />
              <div className="flex items-start justify-between gap-12">
                <span className="text-text-muted">{card.icon}</span>
                {card.meta && (
                  <span className="label-text text-text-dim">{card.meta}</span>
                )}
              </div>
              <div className="flex-1">
                <h3
                  className="text-text mb-4"
                  style={{
                    fontFamily: "var(--display)",
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: "-0.2px",
                  }}
                >
                  {card.label}
                </h3>
                <p
                  className="text-text-muted leading-relaxed"
                  style={{ fontFamily: "var(--mono)", fontSize: 11 }}
                >
                  {card.description}
                </p>
              </div>
              <div className="flex items-center justify-end mt-auto">
                <ArrowUpRight
                  size={12}
                  strokeWidth={1.5}
                  className="text-text-muted"
                />
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
