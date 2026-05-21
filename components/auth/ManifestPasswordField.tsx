"use client";

import { useId, useState, type InputHTMLAttributes } from "react";
import { Eye, EyeOff } from "lucide-react";
import styles from "./manifest.module.css";

/**
 * Manifest-styled password input with eye-icon visibility toggle.
 *
 * Drop-in replacement for `<ManifestInput type="password" />`. The toggle
 * button sits inline at the right of the field, tucked into the manifest
 * row's content column so it doesn't disturb the row's grid layout.
 *
 * The button is type="button" so it never accidentally submits the form
 * when the user clicks it.
 */
export function ManifestPasswordField({
  className = "",
  onChange,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  const labelId = useId();

  return (
    <div className="flex items-center gap-12" style={{ position: "relative" }}>
      <input
        {...rest}
        type={visible ? "text" : "password"}
        aria-describedby={labelId}
        onChange={onChange}
        className={`${styles.field} ${className}`.trim()}
        style={{ flex: 1, minWidth: 0 }}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="shrink-0 inline-flex items-center justify-center text-text-muted hover:text-text transition-colors"
        style={{
          width: 24,
          height: 24,
          background: "transparent",
          border: 0,
          cursor: "pointer",
        }}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        title={visible ? "Hide password" : "Show password"}
      >
        {visible ? (
          <EyeOff size={13} strokeWidth={1.5} aria-hidden />
        ) : (
          <Eye size={13} strokeWidth={1.5} aria-hidden />
        )}
      </button>
      <span id={labelId} className="sr-only">
        {visible
          ? "Password is currently visible"
          : "Password is currently hidden"}
      </span>
    </div>
  );
}
