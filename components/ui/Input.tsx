"use client";

import { forwardRef, useId, useState } from "react";
import type { InputHTMLAttributes, ReactNode } from "react";

interface Props extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  error?: string;
  hint?: string;
  /**
   * Optional leading icon (typically a lucide-react icon at size ~13).
   *
   * When provided, the field-shell switches to a flex-row layout (via the
   * `data-with-icon` attribute and matching globals.css rule) so the icon
   * sits inline at the left of the field. The floating label position
   * shifts right to clear the icon.
   *
   * Example: <Input label="Email" icon={<Mail size={13} strokeWidth={1.5} />} />
   */
  icon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, Props>(function Input(
  {
    label,
    error,
    hint,
    id,
    className,
    onChange,
    onBlur,
    defaultValue,
    value,
    icon,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = error ? `${inputId}-error` : undefined;
  const hintId = hint ? `${inputId}-hint` : undefined;

  const [filled, setFilled] = useState(Boolean(defaultValue || value));
  const hasIcon = Boolean(icon);

  return (
    <div className={className}>
      <label
        className="field-shell block"
        data-error={Boolean(error)}
        data-filled={filled || Boolean(value)}
        data-with-icon={hasIcon || undefined}
      >
        {hasIcon && (
          <span className="field-icon" aria-hidden>
            {icon}
          </span>
        )}
        <span className="field-label" id={`${inputId}-label`}>
          {label}
        </span>
        <input
          ref={ref}
          id={inputId}
          className="field-input"
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={
            [errorId, hintId].filter(Boolean).join(" ") || undefined
          }
          defaultValue={defaultValue}
          value={value}
          onChange={(e) => {
            setFilled(e.target.value.length > 0);
            onChange?.(e);
          }}
          onBlur={(e) => {
            setFilled(e.target.value.length > 0);
            onBlur?.(e);
          }}
          {...props}
        />
      </label>
      {error && (
        <p id={errorId} className="field-error" role="alert">
          {error}
        </p>
      )}
      {!error && hint && (
        <p id={hintId} className="mt-6 mono-sm text-text-muted">
          {hint}
        </p>
      )}
    </div>
  );
});
