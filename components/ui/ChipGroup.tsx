"use client";

import { Check, Lock } from "lucide-react";

export interface ChipDef {
  value: string;
  label: string;
  /** Optional supporting line under the label. */
  desc?: string;
  /** Locked chips render selected and cannot be toggled off. */
  locked?: boolean;
}

interface Props {
  ariaLabel: string;
  chips: ChipDef[];
  /** Controlled selected values (order = click order, meaningful for ranks). */
  values: string[];
  onChange: (values: string[]) => void;
  /**
   * When set, one hidden input per selected value posts through plain
   * FormData (formData.getAll(name)), preserving selection order.
   */
  name?: string;
  /** Selection cap — further clicks are ignored until something is unpicked. */
  max?: number;
  /** Show the 1-based pick order on each selected chip (for ranked picks). */
  showRank?: boolean;
}

/**
 * Multi-select chip list — the ListSearchToolbar filled-toggle idiom
 * (aria-pressed, accent-dim fill when on) promoted to a shared primitive.
 * Selection order is preserved so ranked picks ("what do you want to see
 * first?") fall out for free.
 */
export function ChipGroup({
  ariaLabel,
  chips,
  values,
  onChange,
  name,
  max,
  showRank = false,
}: Props) {
  const toggle = (chip: ChipDef) => {
    if (chip.locked) return;
    if (values.includes(chip.value)) {
      onChange(values.filter((v) => v !== chip.value));
    } else {
      if (max !== undefined && values.length >= max) return;
      onChange([...values, chip.value]);
    }
  };

  const atCap = max !== undefined && values.length >= max;

  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap gap-8">
      {name &&
        values.map((v) => (
          <input key={v} type="hidden" name={name} value={v} aria-hidden />
        ))}
      {chips.map((chip) => {
        const selected = chip.locked || values.includes(chip.value);
        const rank = showRank ? values.indexOf(chip.value) : -1;
        const capped = !selected && atCap;
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={selected}
            aria-disabled={chip.locked || capped || undefined}
            onClick={() => toggle(chip)}
            className={`inline-flex items-start gap-8 px-12 py-8 text-left transition-colors ${
              selected
                ? "hairline-subtle border-[var(--accent-soft)] bg-[var(--accent-dim)]"
                : "hairline-subtle bg-[var(--surface)] hover:bg-[var(--surface-2)]"
            } ${capped ? "opacity-40 cursor-not-allowed" : ""}`}
            title={
              chip.locked
                ? "Always on"
                : capped
                ? `Pick at most ${max}`
                : undefined
            }
          >
            <span
              className={`mt-1 shrink-0 ${
                selected ? "text-[var(--accent)]" : "text-text-dim"
              }`}
              aria-hidden
            >
              {chip.locked ? (
                <Lock size={10} strokeWidth={1.5} />
              ) : rank >= 0 ? (
                <span
                  className="tnum"
                  style={{ fontFamily: "var(--mono)", fontSize: 10, fontWeight: 600 }}
                >
                  {rank + 1}
                </span>
              ) : (
                <Check
                  size={10}
                  strokeWidth={1.5}
                  className={selected ? "" : "opacity-0"}
                />
              )}
            </span>
            <span className="min-w-0">
              <span
                className={`block ${selected ? "text-text" : "text-text-secondary"}`}
                style={{
                  fontFamily: "var(--display)",
                  fontSize: 12,
                  fontWeight: 500,
                }}
              >
                {chip.label}
              </span>
              {chip.desc && (
                <span
                  className="block mono-sm text-text-dim mt-2"
                  style={{ fontSize: 10, lineHeight: 1.5 }}
                >
                  {chip.desc}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
