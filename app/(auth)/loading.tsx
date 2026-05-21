export default function AuthLoading() {
  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-32"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="flex items-center gap-12">
        <span className="dot dot-live shrink-0" aria-hidden />
        <span
          className="text-text-muted"
          style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            letterSpacing: "1.6px",
            textTransform: "uppercase",
          }}
        >
          Loading
        </span>
      </div>
    </div>
  );
}
