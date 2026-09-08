"use client";

import { Check } from "lucide-react";

export interface StepDef {
  key: string;
  label: string;
}

interface Props {
  steps: StepDef[];
  /** Zero-based index of the active step. */
  current: number;
  /** Highest step index the user has reached — steps up to it are clickable. */
  maxReached: number;
  onSelect: (index: number) => void;
}

/**
 * Horizontal wizard step rail, an evolution of the "01 · Workspace" section
 * numbering idiom: mono numerals on a 1px hairline track, active step in
 * accent, completed steps get a check and stay clickable so nothing is a
 * one-way door.
 */
export function Stepper({ steps, current, maxReached, onSelect }: Props) {
  return (
    <ol className="flex items-center gap-0" aria-label="Setup steps">
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const reachable = i <= maxReached;
        return (
          <li key={step.key} className="flex items-center flex-1 min-w-0 last:flex-none">
            <button
              type="button"
              onClick={() => reachable && onSelect(i)}
              disabled={!reachable}
              aria-current={active ? "step" : undefined}
              className={`inline-flex items-center gap-6 shrink-0 transition-colors ${
                active
                  ? "text-[var(--accent)]"
                  : done
                  ? "text-text-secondary hover:text-text"
                  : reachable
                  ? "text-text-muted hover:text-text"
                  : "text-text-dim cursor-default"
              }`}
              title={step.label}
            >
              <span
                className="tnum"
                style={{
                  fontFamily: "var(--mono)",
                  fontSize: 11,
                  letterSpacing: "1px",
                  fontWeight: 500,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              {done && (
                <Check size={11} strokeWidth={1.5} aria-label="Completed" />
              )}
              <span className="label-text hidden sm:inline truncate">
                {step.label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                className="flex-1 h-px mx-10 min-w-[12px]"
                style={{
                  background: done ? "var(--accent-soft)" : "var(--border-subtle)",
                }}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
