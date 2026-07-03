"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";

/**
 * URL-driven search toolbar for directory list pages (customers, suppliers).
 *
 * Mirrors components/inventory/InventoryToolbar.tsx: the search term lives in
 * `?q=` so it stays shareable and cacheable (the server fetchers key their
 * unstable_cache on it), debounced 300ms through useTransition. The optional
 * "Active only / Showing inactive" toggle writes `?inactive=1` and navigates
 * immediately. Any change resets `page` to 1; `pageSize` is preserved.
 */
interface Props {
  placeholder: string;
  searchAriaLabel?: string;
  /** Render the active-only / showing-inactive toggle bound to ?inactive=1. */
  inactiveToggle?: boolean;
}

export function ListSearchToolbar({
  placeholder,
  searchAriaLabel = "Search",
  inactiveToggle = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = params.get("q") ?? "";
  const showInactive = params.get("inactive") === "1";

  const [term, setTerm] = useState(urlQuery);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setTerm(urlQuery);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuery]);

  function pushParams(mutate: (next: URLSearchParams) => void) {
    const next = new URLSearchParams(params.toString());
    mutate(next);
    next.delete("page");
    startTransition(() => {
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  }

  function onTermChange(value: string) {
    setTerm(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      pushParams((next) => {
        const trimmed = value.trim();
        if (trimmed) next.set("q", trimmed);
        else next.delete("q");
      });
    }, 300);
  }

  function toggleInactive() {
    pushParams((next) => {
      if (showInactive) next.delete("inactive");
      else next.set("inactive", "1");
    });
  }

  return (
    <div className="flex items-center gap-10 flex-wrap">
      <div className="relative flex-1 min-w-[240px] max-w-[420px]">
        <Search
          size={12}
          strokeWidth={1.5}
          className="absolute left-12 top-1/2 -translate-y-1/2 text-text-dim pointer-events-none"
          aria-hidden
        />
        <input
          value={term}
          onChange={(e) => onTermChange(e.target.value)}
          placeholder={placeholder}
          aria-label={searchAriaLabel}
          className="field-shell w-full pl-32 pr-32 py-8 mono-sm"
        />
        {(isPending || term) && (
          <span className="absolute right-12 top-1/2 -translate-y-1/2">
            {isPending ? (
              <Loader2
                size={12}
                strokeWidth={1.5}
                className="text-text-dim animate-spin"
                aria-hidden
              />
            ) : (
              <button
                type="button"
                onClick={() => onTermChange("")}
                className="text-text-dim hover:text-text"
                aria-label="Clear search"
              >
                <X size={12} strokeWidth={1.5} />
              </button>
            )}
          </span>
        )}
      </div>

      {inactiveToggle && (
        <button
          type="button"
          onClick={toggleInactive}
          aria-pressed={showInactive}
          className={`hairline-subtle px-10 py-7 inline-flex items-center gap-6 transition-colors ${
            showInactive
              ? "border-[var(--accent-soft)] bg-[var(--accent-dim)] text-[var(--accent)]"
              : "hover:border-[var(--border-hover)] text-text-secondary hover:text-text"
          }`}
        >
          <span
            style={{
              fontFamily: "var(--mono)",
              fontSize: 10,
              letterSpacing: "0.8px",
              textTransform: "uppercase",
            }}
          >
            {showInactive ? "Showing inactive" : "Active only"}
          </span>
        </button>
      )}
    </div>
  );
}
