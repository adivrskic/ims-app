"use client";

import { forwardRef, useId } from "react";
import type { ReactNode, TextareaHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  /** Small note on the right of the label row, e.g. "optional". */
  labelNote?: ReactNode;
  error?: string;
  hint?: string;
  /** Applied to the outer wrapper. */
  className?: string;
}

/**
 * Multi-line text. Same anatomy as Input — static label, bordered shell,
 * help/error beneath — so notes fields stop being hand-rolled in ten
 * different ways. Resizes vertically; `rows` sets the initial height.
 */
export const Textarea = forwardRef<HTMLTextAreaElement, Props>(
  function Textarea(
    { label, labelNote, error, hint, id, className, disabled, rows = 3, ...props },
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
            {labelNote && (
              <span className="field-label-note">{labelNote}</span>
            )}
          </label>
        )}
        <div
          className="field-shell"
          data-error={error ? "true" : undefined}
          data-disabled={disabled ? "true" : undefined}
        >
          <textarea
            ref={ref}
            id={inputId}
            rows={rows}
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
  }
);
