import type { ReactNode } from "react";

interface Props {
  /**
   * Buttons in reading order: secondary actions first, the primary action
   * LAST — it renders rightmost, where the eye lands at the end of a form.
   * (Forms used to disagree about this; SupplierForm put Submit on the left.)
   */
  children: ReactNode;
  /** Left-aligned status, e.g. a "Saved ✓" confirmation. */
  status?: ReactNode;
  /** Drop the top rule — for footers that already sit on a bordered edge. */
  bare?: boolean;
  className?: string;
}

export function FormActions({ children, status, bare = false, className }: Props) {
  return (
    <div
      className={`form-actions ${bare ? "form-actions--bare" : ""} ${
        className ?? ""
      }`}
    >
      {status && <span className="form-actions__status">{status}</span>}
      {children}
    </div>
  );
}
