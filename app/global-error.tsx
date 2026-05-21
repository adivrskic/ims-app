"use client";

import { useEffect } from "react";

/**
 * Catastrophic error boundary — runs only when the ROOT layout fails to
 * render (CSS not loaded, theme init script crashed, RootLayout itself
 * threw). Must provide its own <html> and <body> tags.
 *
 * Styled inline with hand-rolled tokens since none of the design system
 * (CSS variables, fonts, Tailwind classes) is guaranteed to be available
 * at this point. Mimics the Nautilus dark aesthetic so it's not jarringly
 * "default browser" looking, but stays defensive.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Catastrophic root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#000",
          color: "#fff",
          fontFamily:
            'ui-monospace, "JetBrains Mono", "SF Mono", Menlo, Consolas, monospace',
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 40,
        }}
      >
        <div
          style={{
            maxWidth: 540,
            width: "100%",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            background: "rgba(239, 68, 68, 0.04)",
            padding: 32,
          }}
        >
          <p
            style={{
              color: "#ef4444",
              fontSize: 11,
              letterSpacing: "2px",
              textTransform: "uppercase",
              margin: 0,
              marginBottom: 14,
            }}
          >
            Critical error
          </p>
          <h1
            style={{
              fontFamily:
                'ui-sans-serif, "Satoshi", -apple-system, system-ui, sans-serif',
              fontSize: 28,
              fontWeight: 500,
              lineHeight: 1.2,
              margin: 0,
              marginBottom: 16,
              color: "#fff",
            }}
          >
            Nautilus couldn&apos;t load.
          </h1>
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: "#a3a3a3",
              margin: 0,
              marginBottom: 24,
            }}
          >
            A fundamental error prevented the application from starting. This is
            usually temporary — try reloading. If it keeps happening, contact
            support with the reference below.
          </p>
          {error.digest && (
            <p
              style={{
                fontSize: 11,
                color: "#737373",
                margin: 0,
                marginBottom: 24,
              }}
            >
              Reference:{" "}
              <code
                style={{
                  background: "rgba(255, 255, 255, 0.06)",
                  padding: "2px 6px",
                }}
              >
                {error.digest}
              </code>
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: "#fff",
              color: "#000",
              border: 0,
              padding: "12px 28px",
              fontFamily: "inherit",
              fontSize: 12,
              fontWeight: 500,
              letterSpacing: "0.5px",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
