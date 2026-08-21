"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ManifestHeader } from "@/components/auth/ManifestHeader";
import { ManifestRow } from "@/components/auth/ManifestRow";
import { ManifestInput } from "@/components/auth/ManifestInput";
import { ManifestPasswordField } from "@/components/auth/ManifestPasswordField";
import { CornerButton } from "@/components/ui/CornerButton";
import { GoogleGlyph } from "@/components/auth/GoogleGlyph";
import { signInWithPassword, signInWithGoogle } from "../actions";

interface Props {
  next: string;
  initialError?: string;
}

export function LoginForm({ next, initialError }: Props) {
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

      <form action={formAction}>
        <input type="hidden" name="next" value={next} />

        <ManifestRow number="01" label="Email address">
          <ManifestInput
            type="email"
            name="email"
            autoComplete="email"
            required
            placeholder="ops@nautilusinventory.com"
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
          <ManifestPasswordField
            name="password"
            autoComplete="current-password"
            required
            placeholder="••••••••"
          />
        </ManifestRow>

        {error && (
          <div className="py-12">
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

      <div className="mt-20 pt-20">
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

      <div className="mt-24 pt-16 flex justify-between">
        <Link
          href={`/magic-link${
            next !== "/" ? `?next=${encodeURIComponent(next)}` : ""
          }`}
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          Use magic link instead →
        </Link>
        {/* Carry `next` through signup exactly as the magic-link above
            does. Without it, someone who follows an invite link while
            signed out lands here, clicks through to sign up, and is then
            sent to /onboarding to create their OWN workspace instead of
            joining the one that invited them. */}
        <Link
          href={`/signup${
            next !== "/" ? `?next=${encodeURIComponent(next)}` : ""
          }`}
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          New operator? →
        </Link>
      </div>
    </div>
  );
}
