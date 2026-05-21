export default function PurchaseOrdersLoading() {
  return (
    <div
      className="flex flex-col gap-32"
      aria-busy="true"
      aria-label="Loading purchase orders"
    >
      <div className="flex items-start justify-between gap-24 flex-wrap">
        <div className="flex flex-col gap-12 max-w-[640px]">
          <div className="skeleton h-10" style={{ width: 80 }} />
          <div className="skeleton h-24" style={{ width: 240 }} />
          <div className="skeleton h-14" style={{ width: 440 }} />
        </div>
        <div className="flex items-center gap-8">
          <div className="skeleton h-32" style={{ width: 128 }} />
          <div className="skeleton h-32" style={{ width: 100 }} />
        </div>
      </div>

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

      <div className="flex items-center gap-2 hairline-b overflow-x-auto py-4">
        {[44, 56, 60, 64, 48, 52, 56].map((w, i) => (
          <div key={i} className="skeleton h-10 mx-12" style={{ width: w }} />
        ))}
      </div>

      <div className="hairline bg-[var(--surface)]">
        <div className="flex items-center gap-16 px-16 py-10 hairline-b">
          <div className="skeleton h-9" style={{ width: 70 }} />
          <div className="skeleton h-9 flex-1" style={{ maxWidth: 160 }} />
          <div className="skeleton h-9" style={{ width: 80 }} />
          <div className="skeleton h-9" style={{ width: 70 }} />
          <div className="skeleton h-9" style={{ width: 80 }} />
        </div>
        {Array.from({ length: 8 }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-16 px-16 py-14 hairline-b last:border-b-0"
          >
            <div className="skeleton h-11" style={{ width: 70 }} />
            <div className="flex flex-col gap-6 flex-1 min-w-0">
              <div
                className="skeleton h-11"
                style={{ width: `${50 + ((i * 11) % 30)}%` }}
              />
              <div className="skeleton h-9" style={{ width: "30%" }} />
            </div>
            <div className="skeleton h-11" style={{ width: 72 }} />
            <div className="skeleton h-11" style={{ width: 80 }} />
            <div className="skeleton h-11" style={{ width: 72 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
