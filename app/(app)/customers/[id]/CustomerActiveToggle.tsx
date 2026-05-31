"use client";

import { useTransition } from "react";
import { Power, Loader2 } from "lucide-react";
import { setCustomerActive } from "../actions";

interface Props {
  customerId: string;
  isActive: boolean;
}

export function CustomerActiveToggle({ customerId, isActive }: Props) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    const confirmMsg = isActive
      ? "Deactivate this customer? They won't appear in pickers for new orders, but existing orders are preserved."
      : "Reactivate this customer?";
    if (!confirm(confirmMsg)) return;
    startTransition(async () => {
      await setCustomerActive(customerId, !isActive);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="hairline-subtle px-10 py-7 inline-flex items-center gap-6 hover:border-[var(--border-hover)] text-text-secondary hover:text-text disabled:opacity-50 transition-colors"
      title={isActive ? "Deactivate customer" : "Reactivate customer"}
    >
      {pending ? (
        <Loader2 size={11} strokeWidth={1.5} className="animate-spin" />
      ) : (
        <Power size={11} strokeWidth={1.5} />
      )}
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 10,
          letterSpacing: "0.8px",
          textTransform: "uppercase",
        }}
      >
        {isActive ? "Deactivate" : "Reactivate"}
      </span>
    </button>
  );
}
