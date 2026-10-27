"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes, MouseEvent } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** Ask before submitting (destructive actions such as cancelling an ASN). */
  confirm?: string;
};

/**
 * Plain-styled submit button for server-action forms whose buttons keep a
 * hand-rolled hairline look (icon-only deletes, ASN receive buttons) rather
 * than the CornerButton chrome. Mirrors `components/ui/SubmitButton` on a raw
 * `<button>`: disabled + aria-busy while the action runs (no double submit)
 * and an optional window.confirm for destructive one-click actions.
 */
export function PendingButton({
  confirm,
  onClick,
  disabled,
  children,
  ...rest
}: Props) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      onClick={(e: MouseEvent<HTMLButtonElement>) => {
        if (confirm && !window.confirm(confirm)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
