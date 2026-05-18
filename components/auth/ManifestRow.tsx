import type { ReactNode } from "react";
import styles from "./manifest.module.css";

interface Props {
  /** "01", "02", etc. The em-dash is added by the component. */
  number: string;
  /** Uppercase mono label above the input. Optional for action rows. */
  label?: string;
  /** Content shown on the right of the label row (e.g., a "Reset →" link). */
  rightSlot?: ReactNode;
  /** Drop the hairline separator below — usually for the last row. */
  noBorder?: boolean;
  children: ReactNode;
}

/**
 * One row of the auth manifest.
 *
 *   01 —    EMAIL ADDRESS                       Reset →
 *           <input>
 *   ─────────────────────────────────────────────────── (hairline)
 *
 * Number is rendered in the left column (44px wide). Label + rightSlot
 * sit in a header row above the content. Hairline-b separates each row;
 * pass `noBorder` for the last row in a manifest.
 */
export function ManifestRow({
  number,
  label,
  rightSlot,
  noBorder,
  children,
}: Props) {
  return (
    <div className={`${styles.row} ${noBorder ? "" : styles.rowBorder}`}>
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
