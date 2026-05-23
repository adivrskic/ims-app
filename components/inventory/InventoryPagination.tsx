import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface Props {
  page: number;
  totalPages: number;
  pageSize: number;
  totalCount: number;
  shown: number;
  pageSizeOptions: readonly number[];
  /** q, category, low, sort, order — everything except page/pageSize */
  baseParams: Record<string, string>;
}

function href(
  baseParams: Record<string, string>,
  overrides: Record<string, string>
) {
  const sp = new URLSearchParams(baseParams);
  for (const [k, v] of Object.entries(overrides)) sp.set(k, v);
  return `/inventory?${sp.toString()}`;
}

export function InventoryPagination({
  page,
  totalPages,
  pageSize,
  totalCount,
  shown,
  pageSizeOptions,
  baseParams,
}: Props) {
  const from = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = (page - 1) * pageSize + shown;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav
      className="px-20 py-12 hairline-t bg-[var(--bg-elevated)] flex items-center justify-between gap-16 flex-wrap"
      aria-label="Inventory pagination"
    >
      <div className="flex items-center gap-16">
        <p className="label-text">
          Showing{" "}
          <span className="text-text tnum">
            {from.toLocaleString()}–{to.toLocaleString()}
          </span>{" "}
          of{" "}
          <span className="text-text tnum">{totalCount.toLocaleString()}</span>
        </p>

        <span className="label-text text-text-dim hidden sm:flex items-center gap-6">
          Per page:
          {pageSizeOptions.map((size) => {
            const active = size === pageSize;
            return (
              <Link
                key={size}
                href={href(baseParams, { pageSize: String(size), page: "1" })}
                aria-current={active ? "true" : undefined}
                className={`tnum px-6 transition-colors ${
                  active
                    ? "text-[var(--accent)]"
                    : "text-text-muted hover:text-text"
                }`}
              >
                {size}
              </Link>
            );
          })}
        </span>
      </div>

      <div className="flex items-center gap-8">
        <PageLink
          disabled={!hasPrev}
          href={href(baseParams, { page: String(page - 1) })}
          label="Previous page"
        >
          <ChevronLeft size={13} strokeWidth={1.5} />
          <span className="label-text">Prev</span>
        </PageLink>

        <span className="label-text text-text-dim tnum px-4">
          Page {page} / {totalPages}
        </span>

        <PageLink
          disabled={!hasNext}
          href={href(baseParams, { page: String(page + 1) })}
          label="Next page"
        >
          <span className="label-text">Next</span>
          <ChevronRight size={13} strokeWidth={1.5} />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  disabled,
  href,
  label,
  children,
}: {
  disabled: boolean;
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  const cls =
    "hairline-subtle px-10 py-6 inline-flex items-center gap-4 transition-colors";
  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={`${cls} text-text-dim opacity-40 pointer-events-none`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={href}
      aria-label={label}
      className={`${cls} text-text-muted hover:text-text`}
    >
      {children}
    </Link>
  );
}
