"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X, Loader2, AlertTriangle } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

interface Props {
  categories: Category[];
}

/**
 * URL-driven inventory toolbar.
 *
 * Every filter lives in the query string so it stays shareable, cacheable
 * (the server fetcher keys its cache on these params), and survives reloads.
 * Search is debounced (300ms); category + low-stock navigate immediately.
 * Any filter change resets `page` to 1. `sort` / `order` / `pageSize` are
 * preserved across filter changes.
 *
 * `category` is the category_id (uuid) — matches app.products.category_id.
 */
export function InventoryToolbar({ categories }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const urlQuery = params.get("q") ?? "";
  const activeCategory = params.get("category") ?? "";
  const lowOnly = params.get("low") === "1";

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
    next.delete("register");
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

  function onCategoryChange(value: string) {
    pushParams((next) => {
      if (value) next.set("category", value);
      else next.delete("category");
    });
  }

  function toggleLow() {
    pushParams((next) => {
      if (lowOnly) next.delete("low");
      else next.set("low", "1");
    });
  }

  function clearAll() {
    setTerm("");
    pushParams((next) => {
      next.delete("q");
      next.delete("category");
      next.delete("low");
    });
  }

  const activeCategoryName = categories.find(
    (c) => c.id === activeCategory
  )?.name;
  const hasFilters = Boolean(urlQuery || activeCategory || lowOnly);

  return (
    <div className="flex flex-col gap-12">
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
            placeholder="Search by name, SKU, or barcode"
            aria-label="Search inventory"
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

        <select
          value={activeCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          aria-label="Filter by category"
          className="field-shell py-8 px-12 mono-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={toggleLow}
          aria-pressed={lowOnly}
          className={`field-shell py-8 px-12 mono-sm inline-flex items-center gap-6 transition-colors ${
            lowOnly
              ? "text-[var(--danger)] border-[var(--danger)]"
              : "text-text-muted hover:text-text"
          }`}
        >
          <AlertTriangle size={11} strokeWidth={1.5} />
          Low stock
        </button>

        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="label-text text-text-muted hover:text-text inline-flex items-center gap-6"
          >
            <X size={11} strokeWidth={1.5} /> Clear filters
          </button>
        )}
      </div>

      {hasFilters && (
        <div className="flex items-center gap-8 flex-wrap">
          {urlQuery && (
            <Chip
              label={`Search: "${urlQuery}"`}
              onClear={() => onTermChange("")}
            />
          )}
          {activeCategory && (
            <Chip
              label={`Category: ${activeCategoryName ?? "—"}`}
              onClear={() => onCategoryChange("")}
            />
          )}
          {lowOnly && <Chip label="Low stock only" onClear={toggleLow} />}
        </div>
      )}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="hairline-subtle inline-flex items-center gap-6 px-10 py-4 label-text text-text-muted">
      {label}
      <button
        type="button"
        onClick={onClear}
        className="text-text-dim hover:text-text"
        aria-label={`Remove ${label}`}
      >
        <X size={10} strokeWidth={1.5} />
      </button>
    </span>
  );
}
