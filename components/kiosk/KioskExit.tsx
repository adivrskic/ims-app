"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import Link from "next/link";

/**
 * Top-right "Exit kiosk" pill, visible only when ?kiosk=1.
 *
 * Builds an exit href that drops the kiosk param but preserves
 * everything else (filters, sort, etc). Press Esc to leave.
 */
export function KioskExit() {
  const pathname = usePathname();
  const params = useSearchParams();
  const [, force] = useState(0);

  const exitHref = (() => {
    const next = new URLSearchParams(params);
    next.delete("kiosk");
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        force((n) => n + 1);
        window.location.href = exitHref;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exitHref]);

  return (
    <Link
      href={exitHref}
      className="fixed top-16 right-16 z-50 hairline-subtle bg-[var(--surface-2)]/80 backdrop-blur px-12 py-8 inline-flex items-center gap-8 text-text-secondary hover:text-text hover:border-[var(--border-hover)] transition-colors"
      style={{
        fontFamily: "var(--mono)",
        fontSize: 11,
        letterSpacing: "1.5px",
        textTransform: "uppercase",
      }}
      aria-label="Exit kiosk mode (Esc)"
      title="Exit kiosk mode · Esc"
    >
      <X size={11} strokeWidth={1.5} />
      Exit kiosk
    </Link>
  );
}
