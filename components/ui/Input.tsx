"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  /** Label shown above the control. Optional — some inline usages omit it. */
  label?: string;
  /** Small note on the right of the label row, e.g. "optional". */
  labelNote?: ReactNode;
  error?: string;
  hint?: string;
  /**
   * Optional leading icon (typically a lucide-react icon at size ~13). The
   * shell switches to an icon row via `data-with-icon`; see globals.css.
   */
  icon?: ReactNode;
  /** Tighter control for inline / toolbar rows. */
  compact?: boolean;
  /** Applied to the outer wrapper (grid sizing etc.). */
  className?: string;
}

/**
 * Text input. Static label above, visible placeholder, helper or error copy
 * beneath — the one field system every form uses (see the FIELDS block in
 * globals.css). Controlled or uncontrolled is up to the caller.
 */
export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  {
    label,
    labelNote,
    error,
    hint,
    icon,
    compact = false,
    id,
    className,
    disabled,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;

  return (
    <div className={`field ${className ?? ""}`}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          <span>{label}</span>
          {labelNote && <span className="field-label-note">{labelNote}</span>}
        </label>
      )}
      <div
        className={`field-shell ${compact ? "field-shell--compact" : ""}`}
        data-error={error ? "true" : undefined}
        data-with-icon={icon ? true : undefined}
        data-disabled={disabled ? "true" : undefined}
      >
        {icon && (
          <span className="field-icon" aria-hidden>
            {icon}
          </span>
        )}
        <input
          ref={ref}
          id={inputId}
          className="field-input"
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [errorId, hintId].filter(Boolean).join(" ") || undefined
          }
          {...props}
        />
      </div>
      {error ? (
        <p id={errorId} className="field-error" role="alert">
          <AlertCircle size={11} strokeWidth={1.5} className="mt-2 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p id={hintId} className="field-help">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
