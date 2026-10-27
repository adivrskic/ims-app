export default function ReportsLoading() {
  return (
    <div
      className="flex flex-col gap-32"
      aria-busy="true"
      aria-label="Loading reports"
    >
      {/* PageHeader */}
      <div className="flex items-start justify-between gap-24 flex-wrap">
        <div className="flex flex-col gap-12 max-w-[640px]">
          <div className="skeleton h-10 w-28" />
          <div className="skeleton h-24 w-72" />
          <div className="skeleton h-14" style={{ width: 380 }} />
        </div>
        <div className="skeleton h-32" style={{ width: 120 }} />
      </div>

      {/* List */}
      <div className="hairline bg-[var(--surface)]">
        {Array.from({ length: 8 }, (_, i) => {
          const titleW = 40 + ((i * 17) % 30);
          return (
            <div
              key={i}
              className="flex items-center gap-16 px-16 py-14 hairline-b last:border-b-0"
            >
              <div className="flex flex-col gap-6 flex-1 min-w-0">
                <div
                  className="skeleton h-11"
                  style={{ width: `${titleW}%` }}
                />
                <div className="skeleton h-9" style={{ width: "26%" }} />
              </div>
              <div className="skeleton h-10" style={{ width: 90 }} />
              <div className="skeleton h-10" style={{ width: 64 }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
