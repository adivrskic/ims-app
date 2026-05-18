import { forwardRef, type InputHTMLAttributes } from "react";
import styles from "./manifest.module.css";

/**
 * Manifest-styled input.
 *
 * Deliberately different from the dashboard's `Input` component: no
 * label, no field-shell, no boxed background. Just a bare input that
 * blends into its ManifestRow parent, which handles label + number
 * rendering and the focus-within indicator.
 *
 * Forwarded ref so server actions can wire to it via `name` and form
 * libraries can read the value. No client-side state — controlled or
 * uncontrolled is up to the caller (the auth forms use uncontrolled
 * + FormData via server actions).
 */
export const ManifestInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(function ManifestInput({ className = "", ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={`${styles.field} ${className}`.trim()}
    />
  );
});
