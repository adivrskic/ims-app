"use client";

import { useFormStatus } from "react-dom";
import { CornerButton } from "./CornerButton";
import type { ComponentProps, MouseEvent } from "react";

type Props = Omit<ComponentProps<typeof CornerButton>, "type" | "loading"> & {
  /**
   * When set, the click asks for confirmation first and the form only
   * submits on OK. Use for destructive one-click actions (cancel, revoke,
   * delete, remove) that have no undo.
   */
  confirm?: string;
};

/**
 * Submit button for server-action `<form>`s rendered from server
 * components. Reads the form's pending state via `useFormStatus`, so the
 * button disables and shows the spinner while the action runs — which is
 * what stops a double click from recording a count or drafting a PO twice.
 *
 * Must be rendered INSIDE the `<form>` it submits (useFormStatus reads the
 * nearest form ancestor).
 */
export function SubmitButton({ confirm, onClick, children, ...rest }: Props) {
  const { pending } = useFormStatus();
  return (
    <CornerButton
      type="submit"
      loading={pending}
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
    </CornerButton>
  );
}
