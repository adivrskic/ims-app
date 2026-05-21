export default function AnalyticsLoading() {
  return (
    <div
      className="flex flex-col gap-32"
      aria-busy="true"
      aria-label="Loading analytics"
    >
      {/* Header */}
      <div className="flex flex-col gap-12 max-w-[640px]">
        <div className="skeleton h-10 w-28" />
        <div className="skeleton h-24 w-72" />
        <div className="skeleton h-14" style={{ width: 460 }} />
      </div>

      {/* AI narration line */}
      <div className="hairline bg-[var(--surface)] p-20 flex items-start gap-14">
        <div className="skeleton h-12 w-12 shrink-0" />
        <div className="flex flex-col gap-8 flex-1">
          <div className="skeleton h-11" style={{ width: "85%" }} />
          <div className="skeleton h-11" style={{ width: "60%" }} />
        </div>
      </div>

      {/* KPI strip (5 metrics) */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-16">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="hairline bg-[var(--surface)] p-20 flex flex-col gap-12"
          >
            <div className="skeleton h-9 w-20" />
            <div className="skeleton h-22 w-28" />
            <div className="skeleton h-9 w-32" />
          </div>
        ))}
      </div>

      {/* Two wide chart blocks */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-24">
        {Array.from({ length: 2 }, (_, i) => (
          <div
            key={i}
            className="hairline bg-[var(--surface)] p-24 flex flex-col gap-20"
          >
            <div className="flex items-center justify-between gap-16">
              <div className="flex flex-col gap-8">
                <div className="skeleton h-10 w-24" />
                <div className="skeleton h-16" style={{ width: 180 }} />
              </div>
              <div className="skeleton h-9" style={{ width: 80 }} />
            </div>
            {/* Chart canvas */}
            <div className="skeleton" style={{ height: 240, width: "100%" }} />
            <div className="flex items-center gap-16">
              {Array.from({ length: 4 }, (_, j) => (
                <div key={j} className="flex items-center gap-6">
                  <div className="skeleton h-8 w-8" />
                  <div className="skeleton h-9" style={{ width: 56 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Breakdown table */}
      <div className="hairline bg-[var(--surface)] p-24 flex flex-col gap-16">
        <div className="skeleton h-14" style={{ width: 220 }} />
        {Array.from({ length: 6 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-16 py-8 hairline-b last:border-b-0"
          >
            <div
              className="skeleton h-10 flex-1"
              style={{ maxWidth: `${30 + ((i * 13) % 30)}%` }}
            />
            <div className="skeleton h-10" style={{ width: 80 }} />
            <div className="skeleton h-10" style={{ width: 60 }} />
            <div className="skeleton h-10" style={{ width: 48 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
