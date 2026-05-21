export default function OrdersLoading() {
  return (
    <div
      className="flex flex-col gap-32"
      aria-busy="true"
      aria-label="Loading orders"
    >
      <div className="flex items-start justify-between gap-24 flex-wrap">
        <div className="flex flex-col gap-12 max-w-[640px]">
          <div className="skeleton h-10 w-24" />
          <div className="skeleton h-24" style={{ width: 220 }} />
          <div className="skeleton h-14" style={{ width: 420 }} />
        </div>
        <div className="skeleton h-32" style={{ width: 140 }} />
      </div>

      {/* Filter chips */}
      <div className="flex items-center gap-2 hairline-b overflow-x-auto py-4">
        {[40, 56, 64, 48, 60, 52, 44].map((w, i) => (
          <div key={i} className="skeleton h-10 mx-12" style={{ width: w }} />
        ))}
      </div>

      {/* Orders table */}
      <div className="hairline bg-[var(--surface)]">
        <div className="flex items-center gap-16 px-16 py-10 hairline-b">
          <div className="skeleton h-9" style={{ width: 80 }} />
          <div className="skeleton h-9 flex-1" style={{ maxWidth: 180 }} />
          <div className="skeleton h-9" style={{ width: 90 }} />
          <div className="skeleton h-9" style={{ width: 80 }} />
          <div className="skeleton h-9" style={{ width: 90 }} />
          <div className="skeleton h-9" style={{ width: 60 }} />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-16 px-16 py-14 hairline-b last:border-b-0"
          >
            <div className="skeleton h-11" style={{ width: 80 }} />
            <div className="flex flex-col gap-6 flex-1 min-w-0">
              <div
                className="skeleton h-11"
                style={{ width: `${50 + ((i * 13) % 25)}%` }}
              />
              <div className="skeleton h-9" style={{ width: "30%" }} />
            </div>
            <div className="skeleton h-11" style={{ width: 72 }} />
            <div className="skeleton h-11" style={{ width: 80 }} />
            <div className="skeleton h-11" style={{ width: 92 }} />
            <div className="skeleton h-11" style={{ width: 48 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
