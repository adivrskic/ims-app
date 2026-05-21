"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { CornerButton, CornerLink } from "@/components/ui/CornerButton";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, route this to Sentry / Highlight / wherever the
    // workspace tracks errors. The digest is what Next.js logs server-side
    // and is what support will ask for if the user reports the issue.
    console.error("App route error:", error);
  }, [error]);

  return (
    <div
      className="min-h-[60vh] flex items-center justify-center py-40"
      role="alert"
    >
      <div className="hairline bg-[var(--surface)] p-32 max-w-[520px] w-full flex flex-col gap-20 brackets">
        <header className="flex items-start gap-14">
          <span
            className="w-40 h-40 hairline-subtle bg-[var(--danger-dim)] flex items-center justify-center text-[var(--danger)] shrink-0"
            aria-hidden
          >
            <AlertTriangle size={16} strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="label-text mb-4" style={{ color: "var(--danger)" }}>
              Error
            </p>
            <h1
              style={{
                fontFamily: "var(--display)",
                fontSize: 22,
                fontWeight: 500,
                color: "var(--text)",
                margin: "0 0 8px",
              }}
            >
              Something went wrong.
            </h1>
            <p className="mono-sm text-text-muted" style={{ lineHeight: 1.6 }}>
              {error.message ||
                "An unexpected error occurred loading this page. Try again — if the issue persists, contact support."}
            </p>
            {error.digest && (
              <p className="mono-sm text-text-dim" style={{ marginTop: 14 }}>
                Reference:{" "}
                <code
                  style={{
                    fontFamily: "var(--mono)",
                    background: "var(--surface-2)",
                    padding: "2px 6px",
                  }}
                >
                  {error.digest}
                </code>
              </p>
            )}
          </div>
        </header>

        <footer className="flex items-center gap-10 hairline-t pt-16 flex-wrap">
          <CornerButton
            type="button"
            variant="primary"
            size="sm"
            onClick={reset}
          >
            <RefreshCw size={11} strokeWidth={1.5} />
            Try again
          </CornerButton>
          <CornerLink href="/" variant="ghost" size="sm">
            <Home size={11} strokeWidth={1.5} />
            Back to overview
          </CornerLink>
        </footer>
      </div>
    </div>
  );
}
