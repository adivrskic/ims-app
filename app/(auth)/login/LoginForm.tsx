"use client";

import { useActionState } from "react";
import Link from "next/link";
import { ManifestHeader } from "@/components/auth/ManifestHeader";
import { ManifestRow } from "@/components/auth/ManifestRow";
import { ManifestInput } from "@/components/auth/ManifestInput";
import { CornerButton } from "@/components/ui/CornerButton";
import { signInWithPassword, signInWithGoogle } from "../actions";

interface Props {
  next: string;
  initialError?: string;
}

export function LoginForm({ next, initialError }: Props) {
  // Action passed directly — no wrapper. signInWithPassword has the
  // canonical (prevState, formData) signature so useActionState wires
  // FormData through correctly.
  const [state, formAction, pending] = useActionState(
    signInWithPassword,
    undefined
  );

  const error = state?.error ?? initialError;

  return (
    <div className="flex flex-col">
      <ManifestHeader eyebrow="Operator manifest" />

      <h1
        style={{
          fontFamily: "var(--display)",
          fontSize: 30,
          fontWeight: 500,
          lineHeight: 1.1,
          letterSpacing: "-0.5px",
          margin: "0 0 28px",
          color: "var(--text)",
        }}
      >
        Sign in to begin <em className="accent-italic">shift</em>.
      </h1>

      <form action={formAction} className="hairline-t">
        <input type="hidden" name="next" value={next} />

        <ManifestRow number="01" label="Email address">
          <ManifestInput
            type="email"
            name="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="ops@nimbus.io"
          />
        </ManifestRow>

        <ManifestRow
          number="02"
          label="Passcode"
          rightSlot={
            <Link
              href="/forgot"
              className="mono-sm text-text-muted hover:text-text transition-colors"
            >
              Reset →
            </Link>
          }
        >
          <ManifestInput
            type="password"
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </ManifestRow>

        {error && (
          <div className="py-12 hairline-b">
            <p
              role="alert"
              className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
            >
              {error}
            </p>
          </div>
        )}

        <ManifestRow number="03" noBorder>
          <CornerButton
            type="submit"
            variant="primary"
            loading={pending}
            fullWidth
          >
            Submit credentials →
          </CornerButton>
        </ManifestRow>
      </form>

      <div className="hairline-t mt-20 pt-20">
        <p className="label-text mb-12" style={{ color: "var(--text-muted)" }}>
          — Alternative
        </p>
        <form action={signInWithGoogle}>
          <input type="hidden" name="next" value={next} />
          <CornerButton type="submit" variant="ghost" fullWidth>
            <GoogleGlyph />
            Continue with Google
          </CornerButton>
        </form>
      </div>

      <div className="hairline-t mt-24 pt-16 flex justify-between">
        <Link
          href={`/magic-link${
            next !== "/" ? `?next=${encodeURIComponent(next)}` : ""
          }`}
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          ← Email me a link
        </Link>
        <Link
          href="/signup"
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          Request access →
        </Link>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
