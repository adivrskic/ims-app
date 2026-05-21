export default function OrderDetailLoading() {
  return (
    <div
      className="flex flex-col gap-32"
      aria-busy="true"
      aria-label="Loading order"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-24 flex-wrap">
        <div className="flex flex-col gap-12 max-w-[640px]">
          <div className="skeleton h-10" style={{ width: 180 }} />
          <div className="skeleton h-26" style={{ width: 280 }} />
          <div className="flex items-center gap-12 mt-4 flex-wrap">
            <div className="skeleton h-10" style={{ width: 100 }} />
            <div className="skeleton h-10" style={{ width: 80 }} />
            <div className="skeleton h-10" style={{ width: 120 }} />
          </div>
        </div>
        <div className="flex items-center gap-8">
          <div className="skeleton h-32" style={{ width: 96 }} />
          <div className="skeleton h-32" style={{ width: 128 }} />
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

      {/* Two-column: line items + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-24">
        <article className="lg:col-span-2 hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
          <div className="flex items-center justify-between">
            <div className="skeleton h-14" style={{ width: 140 }} />
            <div className="skeleton h-10" style={{ width: 64 }} />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-16 py-10 hairline-b">
              {[24, 80, 56, 64, 56].map((w, i) => (
                <div
                  key={i}
                  className="skeleton h-9"
                  style={{
                    width: i === 1 ? "auto" : w,
                    flex: i === 1 ? 1 : "none",
                  }}
                />
              ))}
            </div>
            {Array.from({ length: 5 }, (_, i) => (
              <div
                key={i}
                className="flex items-center gap-16 py-14 hairline-b last:border-b-0"
              >
                <div className="skeleton h-10 w-10 shrink-0" />
                <div className="flex flex-col gap-6 flex-1 min-w-0">
                  <div
                    className="skeleton h-11"
                    style={{ width: `${50 + ((i * 11) % 30)}%` }}
                  />
                  <div className="skeleton h-9" style={{ width: "35%" }} />
                </div>
                <div className="skeleton h-10" style={{ width: 56 }} />
                <div className="skeleton h-10" style={{ width: 64 }} />
                <div className="skeleton h-10" style={{ width: 56 }} />
              </div>
            ))}
          </div>
        </article>

        <aside className="hairline bg-[var(--surface)] p-24 flex flex-col gap-18">
          <div className="skeleton h-14" style={{ width: 120 }} />
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex flex-col gap-6">
              <div className="skeleton h-9 w-24" />
              <div
                className="skeleton h-11"
                style={{ width: `${50 + ((i * 13) % 35)}%` }}
              />
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
