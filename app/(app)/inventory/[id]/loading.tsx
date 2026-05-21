export default function ProductDetailLoading() {
  return (
    <div
      className="flex flex-col gap-32"
      aria-busy="true"
      aria-label="Loading product"
    >
      {/* Header with breadcrumb + actions */}
      <div className="flex items-start justify-between gap-24 flex-wrap">
        <div className="flex flex-col gap-12 max-w-[640px]">
          <div className="skeleton h-10" style={{ width: 220 }} />
          <div className="skeleton h-26" style={{ width: 380 }} />
          <div className="flex items-center gap-12 mt-4 flex-wrap">
            <div className="skeleton h-10 w-32" />
            <div className="skeleton h-10 w-40" />
            <div className="skeleton h-10 w-36" />
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="skeleton h-32" style={{ width: 140 }} />
          <div className="skeleton h-32 w-32" />
        </div>
      </div>

      {/* KPI strip */}
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

      {/* Details grid: spec card (2/3) + locations card (1/3) */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-24">
        <article className="lg:col-span-2 hairline bg-[var(--surface)] p-24 flex flex-col gap-20">
          <div className="skeleton h-12 w-36" />
          <div className="grid grid-cols-2 gap-x-32 gap-y-16">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex flex-col gap-6">
                <div className="skeleton h-9 w-24" />
                <div
                  className="skeleton h-11"
                  style={{ width: `${40 + ((i * 11) % 40)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="skeleton h-12 w-44 mt-12" />
          <div className="grid grid-cols-2 gap-x-32 gap-y-16">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="flex flex-col gap-6">
                <div className="skeleton h-9 w-24" />
                <div
                  className="skeleton h-11"
                  style={{ width: `${30 + ((i * 9) % 35)}%` }}
                />
              </div>
            ))}
          </div>
        </article>

        <article className="hairline bg-[var(--surface)] p-24 flex flex-col gap-14">
          <div className="skeleton h-12 w-32" />
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="flex items-center gap-12 py-8 hairline-b last:border-b-0"
            >
              <div className="skeleton h-10 w-10 shrink-0" />
              <div className="flex flex-col gap-6 flex-1">
                <div className="skeleton h-10" style={{ width: "70%" }} />
                <div className="skeleton h-9" style={{ width: "40%" }} />
              </div>
              <div className="skeleton h-10 w-16" />
            </div>
          ))}
        </article>
      </section>
    </div>
  );
}
