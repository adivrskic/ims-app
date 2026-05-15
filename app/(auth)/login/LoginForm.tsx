"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/Input";
import { CornerButton } from "@/components/ui/CornerButton";
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
    <div className="flex flex-col gap-20">
      <form action={formAction} className="flex flex-col gap-12">
        <input type="hidden" name="next" value={next} />

        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
        />

        <div>
          <Input
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
          <div className="mt-8 flex justify-end">
            <Link
              href="/forgot"
              className="mono-sm text-text-muted hover:text-text transition-colors"
            >
              Forgot password?
            </Link>
          </div>
        </div>

        {error && (
          <p
            role="alert"
            className="hairline-subtle border-[rgba(239,68,68,0.45)] bg-[var(--danger-dim)] px-12 py-10 mono-sm text-[var(--danger)]"
          >
            {error}
          </p>
        )}

        <CornerButton
          type="submit"
          variant="primary"
          loading={pending}
          fullWidth
        >
          Sign in
        </CornerButton>
      </form>

      <div className="flex items-center gap-12">
        <div className="flex-1 h-px bg-[var(--border-subtle)]" />
        <span className="label-text">Or</span>
        <div className="flex-1 h-px bg-[var(--border-subtle)]" />
      </div>

      <form action={signInWithGoogle}>
        <CornerButton type="submit" variant="ghost" fullWidth>
          <GoogleGlyph />
          Continue with Google
        </CornerButton>
      </form>

      <div className="hairline-t pt-20 mt-4 flex items-center justify-between">
        <Link
          href="/magic-link"
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          Email sign-in link
        </Link>
        <Link
          href="/signup"
          className="mono-sm text-text-muted hover:text-text transition-colors"
        >
          Create account →
        </Link>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.5 12.27c0-.79-.07-1.55-.2-2.27H12v4.3h5.92c-.26 1.36-1.04 2.51-2.21 3.28v2.73h3.57c2.08-1.92 3.28-4.74 3.28-8.04z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.73c-.99.66-2.25 1.05-3.71 1.05-2.86 0-5.28-1.93-6.14-4.52H2.18v2.84A11 11 0 0 0 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.86 14.14a6.59 6.59 0 0 1 0-4.28V7.02H2.18a11 11 0 0 0 0 9.96l3.68-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.65l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.02l3.68 2.84C6.72 7.31 9.14 5.38 12 5.38z"
        fill="#EA4335"
      />
    </svg>
  );
}
