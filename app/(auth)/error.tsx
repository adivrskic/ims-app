"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { CornerButton } from "@/components/ui/CornerButton";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth route error:", error);
  }, [error]);

  return (
    <div
      className="min-h-[60vh] flex items-center justify-center px-32 py-40"
      role="alert"
    >
      <div
        className="hairline p-28 max-w-[420px] w-full flex flex-col gap-18"
        style={{
          background: "var(--field-bg)",
          borderColor: "var(--auth-border-subtle)",
        }}
      >
        <header className="flex items-start gap-12">
          <span
            className="w-32 h-32 hairline-subtle flex items-center justify-center shrink-0"
            style={{
              background: "var(--danger-dim)",
              color: "var(--danger)",
            }}
            aria-hidden
          >
            <AlertTriangle size={14} strokeWidth={1.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p
              className="label-text"
              style={{ color: "var(--danger)", marginBottom: 4 }}
            >
              Couldn&apos;t sign in
            </p>
            <p
              style={{
                fontFamily: "var(--display)",
                fontSize: 18,
                fontWeight: 500,
                color: "var(--auth-text)",
                margin: "0 0 8px",
              }}
            >
              Something went wrong.
            </p>
            <p
              className="mono-sm"
              style={{
                lineHeight: 1.6,
                color: "var(--auth-text-muted)",
              }}
            >
              {error.message ||
                "We couldn't complete that auth step. Try again or head back to sign-in."}
            </p>
            {error.digest && (
              <p
                className="mono-sm"
                style={{
                  marginTop: 12,
                  color: "var(--auth-text-dim)",
                }}
              >
                Reference: <code>{error.digest}</code>
              </p>
            )}
          </div>
        </header>

        <footer className="flex items-center gap-10 flex-wrap">
          <CornerButton
            type="button"
            variant="primary"
            size="sm"
            onClick={reset}
          >
            <RefreshCw size={11} strokeWidth={1.5} />
            Try again
          </CornerButton>
          <Link
            href="/login"
            className="label-text transition-colors"
            style={{ color: "var(--auth-text-secondary)" }}
          >
            Back to sign in →
          </Link>
        </footer>
      </div>
    </div>
  );
}
