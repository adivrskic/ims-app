import type { ReactNode } from "react";
import styles from "./manifest.module.css";

interface Props {
  /** "01", "02", etc. The em-dash is added by the component. */
  number: string;
  /** Uppercase mono label above the input. Optional for action rows. */
  label?: string;
  /** Content shown on the right of the label row (e.g., a "Reset →" link). */
  rightSlot?: ReactNode;
  /**
   * Retained for call-site compatibility; rows no longer draw a separator
   * (the manifest deliberately reads as one open column, no dividers).
   */
  noBorder?: boolean;
  children: ReactNode;
}

/**
 * One row of the auth manifest.
 *
 *   01 —    EMAIL ADDRESS                       Reset →
 *           <input>
 *
 * Number is rendered in the left column (44px wide). Label + rightSlot
 * sit in a header row above the content. Rows are separated by spacing
 * alone — no divider rule — so the manifest reads as one open column.
 */
export function ManifestRow({
  number,
  label,
  rightSlot,
  children,
}: Props) {
  return (
    <div className={styles.row}>
      <span className={styles.number}>{number} —</span>
      <div className={styles.content}>
        {(label || rightSlot) && (
          <div className={styles.labelRow}>
            {label && <span className={styles.label}>{label}</span>}
            {rightSlot}
          </div>
        )}
        <div>{children}</div>
      </div>
    </div>
  );
}
