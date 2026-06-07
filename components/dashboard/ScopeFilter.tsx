"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { Building2, Calendar } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { RANGES, type Range, rangeLabel } from "@/lib/scope";

interface Warehouse {
  id: string;
  name: string;
}

interface Props {
  warehouses: Warehouse[];
  currentWarehouseId: string | null;
  currentRange: Range;
  /** Show only the warehouse picker (e.g. on Overview where range isn't used) */
  rangeHidden?: boolean;
}

/**
 * Filter bar that sits at the top of dashboard pages. Two controls:
 *
 *   - Warehouse: dropdown, "All facilities" by default
 *   - Range:     chips for 7d / 14d / 30d / 90d
 *
 * Both write to URL search params. We deliberately use replace (not push) so
 * the browser back button takes you to the previous page, not the previous
 * filter state — most users expect that.
 */
export function ScopeFilter({
  warehouses,
  currentWarehouseId,
  currentRange,
  rangeHidden,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value.length > 0) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const qs = params.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    });
  };

  return (
    <div
      className={`flex items-center gap-12 flex-wrap hairline bg-[var(--surface)] px-14 py-10 ${
        pending ? "opacity-70" : ""
      } transition-opacity`}
    >
      {/* Warehouse picker */}
      <label className="flex items-center gap-8">
        <Building2
          size={12}
          strokeWidth={1.5}
          className="text-text-dim shrink-0"
        />
        <span className="label-text text-text-muted">Facility</span>
        <Select
          value={currentWarehouseId ?? ""}
          onChange={(v) => setParam("warehouse", v || null)}
          ariaLabel="Filter by facility"
          compact
          disabled={pending}
          placeholder="All facilities"
          className="min-w-[180px]"
          options={warehouses.map((w) => ({ value: w.id, label: w.name }))}
        />
      </label>

      {!rangeHidden && (
        <>
          <span
            className="hidden md:block w-px h-12 bg-[var(--border-subtle)]"
            aria-hidden
          />

          {/* Range chips */}
          <div className="flex items-center gap-8 flex-wrap">
            <Calendar
              size={12}
              strokeWidth={1.5}
              className="text-text-dim shrink-0"
            />
            <span className="label-text text-text-muted">Window</span>
            <div className="flex items-center gap-1">
              {RANGES.map((r) => {
                const active = r === currentRange;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setParam("range", r === "14d" ? null : r)}
                    aria-pressed={active}
                    disabled={pending}
                    title={rangeLabel(r)}
                    className={`mono-sm tnum px-10 py-5 transition-colors hairline-subtle ${
                      active
                        ? "text-[var(--accent)] border-[var(--accent)]"
                        : "text-text-muted hover:text-text hover:border-[var(--border-hover)]"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
