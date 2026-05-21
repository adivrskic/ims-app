/**
 * Generic loading skeleton for any authenticated route.
 *
 * Matches the §8.2 layout that most pages follow: header eyebrow + title
 * + description, KPI strip, then a content panel with row-shaped placeholders.
 * Specific pages can ship their own loading.tsx in their route folder to
 * override this with a more tailored skeleton.
 */
export default function Loading() {
  return (
    <div
      className="flex flex-col gap-32 animate-fade-in"
      aria-busy="true"
      aria-label="Loading"
    >
      {/* PageHeader skeleton */}
      <div className="flex flex-col gap-12 max-w-[640px]">
        <div className="skeleton h-10 w-28" />
        <div className="skeleton h-24 w-72" />
        <div className="skeleton h-14 w-full" style={{ maxWidth: 480 }} />
      </div>

      {/* KPI strip skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-16">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="hairline bg-[var(--surface)] p-20 flex flex-col gap-12"
          >
            <div className="skeleton h-10 w-24" />
            <div className="skeleton h-22 w-32" />
          </div>
        ))}
      </div>

      {/* Content panel skeleton */}
      <div className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
        <div className="skeleton h-12 w-40" />
        <div className="flex flex-col divide-y divide-[var(--border-subtle)]">
          {Array.from({ length: 7 }, (_, i) => {
            // Vary widths so rows look natural rather than uniform.
            const titleWidth = 50 + ((i * 13) % 30);
            const metaWidth = 12 + ((i * 7) % 12);
            return (
              <div
                key={i}
                className="flex items-center gap-16 py-12 first:pt-0"
              >
                <div className="skeleton h-10 w-10 shrink-0" />
                <div className="flex-1 flex flex-col gap-6 min-w-0">
                  <div
                    className="skeleton h-11"
                    style={{ width: `${titleWidth}%` }}
                  />
                  <div className="skeleton h-9" style={{ width: "30%" }} />
                </div>
                <div
                  className="skeleton h-10"
                  style={{ width: `${metaWidth}%` }}
                />
                <div className="skeleton h-10 w-16 shrink-0" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
