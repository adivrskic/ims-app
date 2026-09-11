"use client";

import { forwardRef, useId } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { Check } from "lucide-react";

interface Props
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> {
  label: ReactNode;
  /** Secondary line beneath the label. */
  description?: ReactNode;
  /** Applied to the outer <label>. */
  className?: string;
}

/**
 * Checkbox with a themed box. The native input stays in the DOM (visually
 * hidden, still focusable, still posts through FormData) and the box is its
 * next sibling so `:checked` / `:focus-visible` style it purely in CSS —
 * see the Checkbox block in globals.css. Replaces the two ad-hoc styles
 * (native accent-color and appearance-none squares) that used to coexist.
 */
export const Checkbox = forwardRef<HTMLInputElement, Props>(function Checkbox(
  { label, description, className, disabled, id, title, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    // `title` goes on the visible label: on the visually-hidden input it
    // would never surface as a tooltip.
    <label
      htmlFor={inputId}
      title={title}
      className={`checkbox ${className ?? ""}`}
      data-disabled={disabled ? "true" : undefined}
    >
      <input
        ref={ref}
        id={inputId}
        type="checkbox"
        className="checkbox-input"
        disabled={disabled}
        {...props}
      />
      <span className="checkbox-box" aria-hidden>
        <Check size={10} strokeWidth={2.5} />
      </span>
      <span className="checkbox-text">
        <span className="checkbox-label">{label}</span>
        {description && <span className="checkbox-desc">{description}</span>}
      </span>
    </label>
  );
});
