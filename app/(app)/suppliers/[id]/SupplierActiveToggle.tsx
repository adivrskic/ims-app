"use client";

import { useTransition } from "react";
import { Power, Loader2 } from "lucide-react";
import { setSupplierActive } from "../actions";

interface Props {
  supplierId: string;
  isActive: boolean;
}

export function SupplierActiveToggle({ supplierId, isActive }: Props) {
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    const confirmMsg = isActive
      ? "Deactivate this supplier? They won't appear in pickers for new POs, but existing POs are preserved."
      : "Reactivate this supplier?";
    if (!confirm(confirmMsg)) return;
    startTransition(async () => {
      await setSupplierActive(supplierId, !isActive);
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="hairline-subtle px-10 py-7 inline-flex items-center gap-6 hover:border-[var(--border-hover)] text-text-secondary hover:text-text disabled:opacity-50 transition-colors"
      title={isActive ? "Deactivate supplier" : "Reactivate supplier"}
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
