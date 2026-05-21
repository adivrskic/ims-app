export default function InventoryLoading() {
  return (
    <div
      className="flex flex-col gap-32"
      aria-busy="true"
      aria-label="Loading inventory"
    >
      {/* PageHeader */}
      <div className="flex items-start justify-between gap-24 flex-wrap">
        <div className="flex flex-col gap-12 max-w-[640px]">
          <div className="skeleton h-10 w-28" />
          <div className="skeleton h-24 w-72" />
          <div className="skeleton h-14" style={{ width: 380 }} />
        </div>
        <div className="flex items-center gap-8">
          <div className="skeleton h-32" style={{ width: 96 }} />
          <div className="skeleton h-32" style={{ width: 120 }} />
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

      {/* Search + filter row */}
      <div className="flex items-center gap-12 flex-wrap">
        <div className="skeleton h-36 flex-1" style={{ minWidth: 240 }} />
        <div className="skeleton h-36 w-36" />
        <div className="skeleton h-36" style={{ width: 140 }} />
      </div>

      {/* Inventory table */}
      <div className="hairline bg-[var(--surface)]">
        <div className="flex items-center gap-16 px-16 py-10 hairline-b">
          <div className="skeleton h-9 w-20" />
          <div className="skeleton h-9 flex-1" style={{ maxWidth: 200 }} />
          <div className="skeleton h-9" style={{ width: 90 }} />
          <div className="skeleton h-9" style={{ width: 70 }} />
          <div className="skeleton h-9" style={{ width: 90 }} />
          <div className="skeleton h-9" style={{ width: 70 }} />
        </div>
        {Array.from({ length: 10 }, (_, i) => {
          const titleW = 45 + ((i * 17) % 25);
          return (
            <div
              key={i}
              className="flex items-center gap-16 px-16 py-14 hairline-b last:border-b-0"
            >
              <div className="skeleton h-10 w-10 shrink-0" />
              <div className="flex flex-col gap-6 flex-1 min-w-0">
                <div
                  className="skeleton h-11"
                  style={{ width: `${titleW}%` }}
                />
                <div className="skeleton h-9" style={{ width: "28%" }} />
              </div>
              <div className="skeleton h-10" style={{ width: 90 }} />
              <div className="skeleton h-10" style={{ width: 64 }} />
              <div className="skeleton h-10" style={{ width: 80 }} />
              <div className="skeleton h-10" style={{ width: 56 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
