"use client";

import { useId, useRef } from "react";
import { Check } from "lucide-react";

export interface OptionCardDef {
  value: string;
  label: string;
  /** Supporting line — plain-language consequence, not jargon. */
  desc?: string;
}

interface Props {
  /** Group label for assistive tech. */
  ariaLabel: string;
  options: OptionCardDef[];
  /** Controlled selected value ("" = none). */
  value: string;
  onChange: (value: string) => void;
  /** When set, a hidden input posts the value through plain FormData. */
  name?: string;
  /** Grid columns on ≥sm screens (1 or 2). Default 2. */
  columns?: 1 | 2;
}

/**
 * Single-select card grid (role=radiogroup). The house selected-state idiom:
 * hairline card that turns border-accent-soft + bg-accent-dim with a corner
 * check. Arrow keys move selection; cards are buttons so Enter/Space work
 * for free.
 */
export function OptionCardGroup({
  ariaLabel,
  options,
  value,
  onChange,
  name,
  columns = 2,
}: Props) {
  const groupId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent, index: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      next = (index + 1) % options.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      next = (index - 1 + options.length) % options.length;
    }
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      const buttons =
        rootRef.current?.querySelectorAll<HTMLButtonElement>("[role=radio]");
      buttons?.[next]?.focus();
    }
  };

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      aria-label={ariaLabel}
      id={groupId}
      className={`grid grid-cols-1 gap-8 ${
        columns === 2 ? "sm:grid-cols-2" : ""
      }`}
    >
      {name && <input type="hidden" name={name} value={value} aria-hidden />}
      {options.map((opt, i) => {
        const selected = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (!value && i === 0) ? 0 : -1}
            onClick={() => onChange(opt.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative text-left p-14 transition-colors ${
              selected
                ? "hairline border-[var(--accent-soft)] bg-[var(--accent-dim)]"
                : "hairline bg-[var(--surface)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {selected && (
              <Check
                size={11}
                strokeWidth={1.5}
                className="absolute top-10 right-10 text-[var(--accent)]"
                aria-hidden
              />
            )}
            <span
              className={`block truncate pr-16 ${
                selected ? "text-[var(--accent)]" : "text-text"
              }`}
              style={{
                fontFamily: "var(--display)",
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              {opt.label}
            </span>
            {opt.desc && (
              <span className="block mono-sm text-text-muted mt-4" style={{ lineHeight: 1.5 }}>
                {opt.desc}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
